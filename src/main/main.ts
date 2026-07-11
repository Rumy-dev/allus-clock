import { app, session, Menu } from 'electron';
import started from 'electron-squirrel-startup';
import { authManager } from './auth/authManager';
import { appStore } from './store/appStore';
import * as taskStore from './store/taskStore';
import * as timerEngine from './store/timerEngine';
import * as windowManager from './windows/windowManager';
import * as tray from './tray';
import { registerIpcHandlers } from './ipcHandlers';
import { initAutoUpdater } from './updater';
import { startIdleMonitor, stopIdleMonitor } from './idleMonitor';
import { startFocusNudgeMonitor, stopFocusNudgeMonitor } from './focusNudgeMonitor';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// App roda em segundo plano via bandeja mesmo sem janelas abertas — não
// encerra no fechar-todas-as-janelas (seção 13 do handoff).
app.on('window-all-closed', () => {
  // intencionalmente vazio
});

const QUIT_FLUSH_TIMEOUT_MS = 5000;
let quitFlushDone = false;

app.on('before-quit', (event) => {
  windowManager.setQuitting(true);
  if (quitFlushDone) return; // already flushed, let this quit proceed
  event.preventDefault();
  Promise.race([
    timerEngine.flushBeforeQuit(),
    new Promise<void>((resolve) => setTimeout(resolve, QUIT_FLUSH_TIMEOUT_MS)),
  ]).finally(() => {
    quitFlushDone = true;
    app.quit();
  });
});

let wasSignedIn = false;
let wasOnline = true;

// Splash de abertura: roda em paralelo à resolução do auth, nunca fica
// presa esperando por um evento assíncrono. `closeSplashAndReveal` corre
// contra um timeout de segurança (SPLASH_TIMEOUT_MS) — se a janela alvo
// demorar mais que isso, a splash fecha de qualquer forma e a janela
// aparece assim que puder, no lugar de travar a abertura do app.
// Mantida em sincronia manual com SPLASH_DURATION_MS em
// src/renderer/pages/Splash/Splash.tsx (não importamos direto do renderer
// pra não puxar React/CSS pro bundle do processo main).
const SPLASH_DURATION_MS = 8900;
const SPLASH_TIMEOUT_MS = 10000;
let splashClosed = false;
let splashStartedAt = 0;
let mainWindowReady = false;
let splashMinElapsed = false;
// A janela da splash carrega de forma assíncrona (mais lenta em dev, via
// Vite dev server) — se o auth resolver antes do 'ready-to-show' disparar,
// closeSplashAndReveal ainda não tem um splashStartedAt válido. Em vez de
// fechar na hora (cortando a animação antes dela sequer começar), guardamos
// o pedido de revelação e o disparamos quando a splash ficar pronta.
let pendingReveal: (() => void) | null = null;
let secondaryPreloadTimeout: NodeJS.Timeout | null = null;

function scheduleReveal(showTarget: () => void): void {
  splashClosed = true;
  const elapsed = Date.now() - splashStartedAt;
  const remaining = Math.max(0, SPLASH_DURATION_MS - elapsed);
  setTimeout(() => {
    try {
      windowManager.closeSplash();
    } finally {
      showTarget();
    }
  }, remaining);
}

function tryRevealMainWindow(): void {
  if (!mainWindowReady || !splashMinElapsed || splashClosed) return;
  splashClosed = true;
  windowManager.closeSplash();
  windowManager.showMainWindow();
}

function closeSplashAndReveal(showTarget: () => void): void {
  if (splashClosed) {
    showTarget();
    return;
  }
  if (splashStartedAt === 0) {
    pendingReveal = showTarget;
    return;
  }
  scheduleReveal(showTarget);
}

function scheduleSecondaryPreloadDuringSplash(): void {
  if (secondaryPreloadTimeout) return;
  // Deixa a splash pintar e animar primeiro. O pre-load começa só no meio da
  // sequência, aproveitando o tempo restante sem brigar com o primeiro frame.
  secondaryPreloadTimeout = setTimeout(() => {
    secondaryPreloadTimeout = null;
    if (!splashClosed) {
      windowManager.preloadSecondaryWindows();
    }
  }, 3200);
}

// CSP aplicada globalmente a todas as janelas via header de resposta (em vez
// de <meta> no HTML) — cobre toda navegação/reload sem precisar duplicar a
// tag em cada página. connect-src cobre a API do Supabase (REST + Realtime
// via wss); em dev também libera o dev server local do Vite (HTTP + HMR via
// ws) já que ele roda em localhost com porta variável.
function applyContentSecurityPolicy(): void {
  const isDev = !app.isPackaged;
  const connectSrc = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'];
  if (isDev) {
    connectSrc.push('http://localhost:*', 'ws://localhost:*');
  }
  const csp = [
    "default-src 'self'",
    // Em dev o Vite injeta um script inline (preamble de HMR/React Refresh)
    // no index.html antes de carregar os módulos — sem 'unsafe-inline' nessa
    // fase, o bootstrap inteiro é bloqueado e a janela abre em branco. Build
    // de produção não tem scripts inline (tudo em arquivos .js externos), só
    // precisa do 'self'.
    `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

app.whenReady().then(async () => {
  applyContentSecurityPolicy();
  // Sem menu de app customizado, o Electron usa o menu padrão — no macOS ele
  // fica sempre visível na barra superior (diferente do Windows/Linux, onde
  // as janelas frame:false não mostram barra nenhuma) e inclui "Toggle
  // Developer Tools" (Cmd+Option+I), abrindo DevTools em produção mesmo com
  // o bloqueio de F12/IPC. setApplicationMenu(null) em prod reduz o macOS ao
  // menu mínimo (nome do app: About/Hide/Quit), sem Edit/View/DevTools.
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }
  // splashStartedAt só é marcado quando a janela fica de fato visível
  // (ready-to-show) — ver comentário em windowManager.showSplash. Contar a
  // partir da criação da janela subtraía o tempo de carregamento do
  // renderer (mais alto em dev) do orçamento da animação.
  windowManager.showSplash(() => {
    splashStartedAt = Date.now();
    if (pendingReveal) {
      const reveal = pendingReveal;
      pendingReveal = null;
      scheduleReveal(reveal);
    }
  });

  registerIpcHandlers();
  appStore.patch({ autoLaunchEnabled: app.getLoginItemSettings().openAtLogin });
  initAutoUpdater();

  // Rede de segurança: nenhuma splash deve poder ficar presa na tela para
  // sempre se algo no fluxo de auth/IPC falhar silenciosamente (inclusive se
  // a janela nunca chegar a disparar 'ready-to-show'). Contada a partir do
  // início do app (não do ready-to-show) — é um teto absoluto.
  setTimeout(() => {
    if (!splashClosed) {
      splashClosed = true;
      windowManager.closeSplash();
      pendingReveal?.();
      pendingReveal = null;
    }
  }, SPLASH_TIMEOUT_MS);

  appStore.subscribe((snapshot) => {
    windowManager.broadcast(snapshot);
    tray.render();

    // Reconectou depois de uma queda — sincroniza o bloco ativo na hora
    // em vez de esperar até 15s pro próximo flush periódico.
    if (snapshot.online && !wasOnline) {
      timerEngine.forceFlushActive().catch((err) => console.error('[main] forceFlushActive falhou', err));
    }
    wasOnline = snapshot.online;
  });

  authManager.on('change', async (state) => {
    if (state.status === 'signedIn') {
      // Preferências da conta (som, modo padrão, minimizável) refletem no
      // appStore sempre que o perfil muda — tanto no primeiro login quanto
      // depois, ao salvar no painel de Configurações.
      appStore.patch({
        auth: { status: 'signedIn', profile: state.profile },
        soundEnabled: state.profile.preferences.soundEnabled,
        soundSplash: state.profile.preferences.soundSplash,
        soundFocusStart: state.profile.preferences.soundFocusStart,
        soundFocusEnd: state.profile.preferences.soundFocusEnd,
        soundBreakEnd: state.profile.preferences.soundBreakEnd,
        soundIdlePause: state.profile.preferences.soundIdlePause,
        floatingMinimizable: state.profile.preferences.floatingMinimizable,
        floatingPanelOpacity: state.profile.preferences.floatingPanelOpacity,
        floatingPanelSize: state.profile.preferences.floatingPanelSize,
        floatingPanelCompactSize: state.profile.preferences.floatingPanelCompactSize,
        floatingPanelPosition: state.profile.preferences.floatingPanelPosition,
        floatingPanelIsCompactMode: state.profile.preferences.floatingPanelIsCompactMode,
        floatingPanelSizeLocked: state.profile.preferences.floatingPanelSizeLocked,
        floatingPanelExpanded: state.profile.preferences.floatingPanelExpanded,
        selectedMode: state.profile.preferences.selectedMode,
      });

      if (!wasSignedIn) {
        wasSignedIn = true;
        windowManager.closeLogin();
        mainWindowReady = false;
        splashMinElapsed = false;
        windowManager.showMainWindow(
          () => {
            mainWindowReady = true;
            tryRevealMainWindow();
          },
          false,
        );
        setTimeout(() => {
          splashMinElapsed = true;
          tryRevealMainWindow();
        }, SPLASH_DURATION_MS);
        // As três hidratações são independentes entre si. Rodar em paralelo
        // evita somar round-trips de rede; allSettled evita travar a abertura
        // do app quando uma consulta falha momentaneamente.
        const hydrationResults = await Promise.allSettled([
          taskStore.hydrateTaxonomy(),
          timerEngine.loadMostUsedTasks(),
          timerEngine.hydrateActiveSession(),
        ]);
        hydrationResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(`[main] hidratação inicial ${index} falhou`, result.reason);
          }
        });
        // Retenta fila offline que pode ter se acumulado desde a última sessão
        await timerEngine.forceFlushActive().catch((err) => console.error('[main] flush na assinatura falhou', err));
        // Inicia retry periódico da fila offline (a cada 60s)
        timerEngine.startPendingQueueRetryLoop();
        startIdleMonitor();
        startFocusNudgeMonitor();
        taskStore.subscribeRealtime();
        scheduleSecondaryPreloadDuringSplash();
        if (mainWindowReady && splashMinElapsed) {
          windowManager.showFloatingPanel();
        } else {
          const checkFloating = setInterval(() => {
            if (mainWindowReady && splashMinElapsed) {
              clearInterval(checkFloating);
              windowManager.showFloatingPanel();
            }
          }, 100);
          setTimeout(() => clearInterval(checkFloating), SPLASH_TIMEOUT_MS);
        }
        tray.initTray();
      }
    } else {
      const hadSignedInSession = wasSignedIn;
      wasSignedIn = false;
      // Para retry loop e faz flush final antes de limpar estado
      timerEngine.stopPendingQueueRetryLoop();
      stopIdleMonitor();
      stopFocusNudgeMonitor();
      if (hadSignedInSession) {
        await Promise.race([
          timerEngine.flushBeforeQuit(),
          new Promise<void>((resolve) => setTimeout(resolve, QUIT_FLUSH_TIMEOUT_MS)),
        ]).catch((err) => console.error('[main] flush no sign-out falhou', err));
      }
      appStore.patch({
        auth: { status: 'signedOut', profile: null },
        activeSession: null,
        activeTaskLogs: [],
        recentSessions: [],
        clients: [],
        projects: [],
        tasks: [],
        recentTasks: [],
        profiles: [],
      });
      await taskStore.unsubscribeRealtime();
      if (hadSignedInSession) {
        windowManager.closeAllAppWindows();
        tray.destroyTray();
        windowManager.showLogin();
      }
    }
  });

  // authManager.init() já dispara 'change' internamente (via hydrateProfile)
  // quando havia uma sessão salva — o handler acima cuida de todo o setup
  // nesse caso. Só precisamos abrir a tela de Login quando não há sessão.
  const initialState = await authManager.init();
  if (initialState.status !== 'signedIn') {
    closeSplashAndReveal(() => windowManager.showLogin());
  }

  // Atalhos de teclado (F12, Cmd/Ctrl+T/H/D/P/F/B) são escopados por janela
  // em windowManager.attachWindowShortcuts — ver comentário lá sobre por que
  // não usamos globalShortcut (sequestraria atalhos do sistema operacional
  // inteiro, ex: Cmd+H de esconder app no macOS).
});

  app.on('activate', () => {
    if (authManager.getState().status === 'signedIn') {
      windowManager.showMainWindow();
    } else {
      windowManager.showLogin();
    }
  });
