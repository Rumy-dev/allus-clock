import { BrowserWindow, app, screen } from 'electron';
import path from 'node:path';
import type { AppSnapshot } from '../../shared/ipc-contract';
import { appStore } from '../store/appStore';
import { authManager } from '../auth/authManager';
import * as timerEngine from '../store/timerEngine';

// '#000001' = fallback opaco pro frame transparente que o Windows/Chromium
// pode compositar antes do primeiro paint do React chegar — sem isso, em
// builds empacotados (processo "frio") esse frame mostra o desktop/wallpaper
// por trás da janela em vez do fundo sólido do app (ver showMainWindow).
// Testamos transparência real (alpha zero) nessas janelas pra ter cantos
// arredondados de verdade — no build empacotado o fundo inteiro (não só os
// cantos) passou a vazar o papel de parede do Windows, deixando o app
// ilegível. Voltamos pro fallback opaco: aceita o quadrado atrás do canto
// arredondado como limitação cosmética conhecida, em troca de um app que
// renderiza certo. Use nas janelas SEM transparência variável de verdade.
const OPAQUE_FALLBACK_BG = '#000001';
// '#00000000' = alpha real — só pra janelas com transparência de verdade
// (Splash, painel flutuante com slider de opacidade). Um fallback opaco
// aqui faria o Chromium misturar o rgba(...) do CSS contra preto opaco em
// vez do desktop de verdade por trás.
const TRANSPARENT_BG = '#00000000';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let isQuitting = false;
export function setQuitting(value: boolean): void {
  isQuitting = value;
}

let floatingResizeTimeout: NodeJS.Timeout | null = null;

// Diferencia um resize disparado pelo usuário (arrastando a borda) de um
// resize programático (auto-fit do painel flutuante via setFloatingHeight).
// Sem isso, o listener 'resized' abaixo persistia QUALQUER mudança de bounds
// como se fosse uma preferência manual do usuário, "contaminando"
// floatingPanelSize com tamanhos de auto-fit e quebrando o reset ao recolher
// o drawer (além de causar um vaivém de resizes que aparentava tremor).
let isProgrammaticFloatingResize = false;
let programmaticResizeResetTimeout: NodeJS.Timeout | null = null;
export function markProgrammaticFloatingResize(): void {
  isProgrammaticFloatingResize = true;
  if (programmaticResizeResetTimeout) clearTimeout(programmaticResizeResetTimeout);
  // O evento nativo 'resized' chega de forma assíncrona depois de setBounds;
  // 150ms é folga suficiente pra cobrir isso sem atrapalhar resizes manuais
  // subsequentes do usuário.
  programmaticResizeResetTimeout = setTimeout(() => {
    isProgrammaticFloatingResize = false;
  }, 150);
}

const windows: {
  login: BrowserWindow | null;
  main: BrowserWindow | null;
  floating: BrowserWindow | null;
  taskCenter: BrowserWindow | null;
  timeCenter: BrowserWindow | null;
  dashboard: BrowserWindow | null;
  pulse: BrowserWindow | null;
  splash: BrowserWindow | null;
} = {
  login: null,
  main: null,
  floating: null,
  taskCenter: null,
  timeCenter: null,
  dashboard: null,
  pulse: null,
  splash: null,
};

function loadPage(win: BrowserWindow, page: string): void {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?window=${page}`);
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), {
      query: { window: page },
    });
  }
  // Uma janela nova só recebe o estado a partir do próximo broadcast — como
  // pode ter sido criada depois do último, empurramos o snapshot atual
  // assim que ela terminar de carregar, pra nunca ficar "vazia".
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('state:update', appStore.getSnapshot());
  });
  attachWindowShortcuts(win);
}

// Atalhos de produtividade (abrir centrais, DevTools, controlar o timer).
// Usamos before-input-event (escopado à janela) em vez de globalShortcut:
// globalShortcut sequestra a combinação em nível de SISTEMA OPERACIONAL
// inteiro, mesmo com outro app em foco — no macOS isso quebrava atalhos
// nativos usadíssimos (Cmd+H esconder app, Cmd+F buscar, Cmd+B negrito,
// Cmd+T nova aba) sempre que o Allus Focus estava rodando em segundo
// plano, o que é o tempo todo (ele vive na bandeja). before-input-event só
// dispara quando a própria janela do Allus Focus está em foco.
function attachWindowShortcuts(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;

    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
      return;
    }

    if (!mod) return;

    switch (input.key.toLowerCase()) {
      case 't':
        toggleTaskCenter();
        event.preventDefault();
        break;
      case 'h':
        toggleTimeCenter();
        event.preventDefault();
        break;
      case 'd':
        toggleDashboard();
        event.preventDefault();
        break;
      case 'p': {
        const authState = authManager.getState();
        if (authState.status === 'signedIn' && authState.profile.role === 'admin') {
          togglePulse();
        }
        event.preventDefault();
        break;
      }
      case 'f': {
        const state = appStore.getSnapshot();
        if (!state.activeSession) {
          const recentTask = state.recentTasks[0];
          if (recentTask) {
            timerEngine
              .focusTask(recentTask.taskId, null, recentTask.taskTitle)
              .then(() => timerEngine.startFocus(recentTask.taskTitle))
              .catch((err) => console.error('[shortcut] Cmd/Ctrl+F falhou', err));
          }
        } else if (state.activeSession.status !== 'Ativo') {
          timerEngine.resume().catch((err) => console.error('[shortcut] Cmd/Ctrl+F resume falhou', err));
        }
        event.preventDefault();
        break;
      }
      case 'b': {
        const state = appStore.getSnapshot();
        if (state.activeSession) {
          const action = state.activeSession.cycleKind === 'Foco' ? timerEngine.skipToBreak() : timerEngine.skipToFocus();
          action.catch((err) => console.error('[shortcut] Cmd/Ctrl+B falhou', err));
        }
        event.preventDefault();
        break;
      }
    }
  });
}

function preloadPath(): string {
  // main.js e preload.js compilam para o mesmo diretório (.vite/build/),
  // conforme configurado pelo @electron-forge/plugin-vite.
  return path.join(__dirname, 'preload.js');
}

function iconPath(): string {
  // Em dev, __dirname aponta pra .vite/build; em produção, os assets vão
  // junto via packagerConfig.extraResource (forge.config.ts). Sem passar
  // `icon` explicitamente ao BrowserWindow, o Windows/Linux mostram o
  // ícone padrão do Electron em vez da logo do Allus Focus.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icon.png')
    : path.join(__dirname, '..', '..', 'assets', 'icon.png');
}

function hideInsteadOfClose(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

export function showLogin(): void {
  if (windows.login && !windows.login.isDestroyed()) {
    windows.login.show();
    windows.login.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 380,
    height: 460,
    resizable: false,
    frame: false,
    // De propósito SEM transparent:true aqui (diferente de Splash/Floating):
    // transparent:true põe a janela no caminho especial de "layered window"
    // do Windows/Chromium, que tem um bug conhecido de não empurrar o frame
    // pintado pra tela de forma confiável — a janela ficava presa mostrando
    // só o backgroundColor (preto sólido) ou o papel de parede, mesmo com o
    // React já totalmente montado por baixo (confirmado forçando um repaint
    // via HMR, que revelou o conteúdo certo instantaneamente). Como essas 6
    // janelas não usam transparência real de qualquer forma (cantos ficam
    // quadrados, ok), tirar transparent:true evita esse bug de vez, usando
    // o caminho normal de composição do Chromium.
    transparent: false,
    backgroundColor: OPAQUE_FALLBACK_BG,
    icon: iconPath(),
    hasShadow: false,
    // De propósito SEM backgroundMaterial/vibrancy nativo aqui: esses
    // materiais do SO pintam o retângulo INTEIRO da janela, competindo com
    // o backgroundColor opaco (mesmo motivo do painel flutuante, ver
    // showFloatingPanel). Efeito vidro fica só no CSS (.allus-glass,
    // backdrop-filter).
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  loadPage(win, 'login');
  win.on('closed', () => {
    windows.login = null;
  });
  windows.login = win;
}

export function closeLogin(): void {
  windows.login?.close();
  windows.login = null;
}

const SPLASH_WIDTH = 360;
const SPLASH_HEIGHT = 280;

export function showSplash(onShown?: () => void): void {
  if (windows.splash && !windows.splash.isDestroyed()) return;

  // Centralizada no monitor PRIMÁRIO (não no monitor com o cursor) — é o
  // comportamento esperado de abertura de app, independente de onde o
  // usuário deixou o mouse antes de clicar no atalho.
  const { bounds } = screen.getPrimaryDisplay();
  const x = Math.round(bounds.x + (bounds.width - SPLASH_WIDTH) / 2);
  const y = Math.round(bounds.y + (bounds.height - SPLASH_HEIGHT) / 2);

  const win = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: TRANSPARENT_BG,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // show só depois de 'ready-to-show': evita o flash preto de um frame que
  // Electron/Chromium pintam antes do primeiro paint transparente chegar.
  // onShown() é o sinal pro chamador começar a contar a duração da
  // animação a partir da hora em que ela FICOU VISÍVEL — em dev mode o
  // carregamento via Vite dev server pode levar centenas de ms a mais que
  // em produção, e contar a partir da criação da janela cortava a
  // animação cedo demais (o "orçamento" de tempo era consumido antes do
  // primeiro frame aparecer).
  win.once('ready-to-show', () => {
    win.show();
    onShown?.();
  });
  win.on('closed', () => {
    windows.splash = null;
  });
  loadPage(win, 'splash');
  windows.splash = win;
}

export function closeSplash(): void {
  const win = windows.splash;
  if (!win || win.isDestroyed()) return;
  windows.splash = null;
  // destroy() em vez de close(): a janela não tem controles de fechar
  // (closable:false) e não precisamos do ciclo normal de eventos 'close'.
  win.destroy();
}

export function showMainWindow(): void {
  if (windows.main && !windows.main.isDestroyed()) {
    windows.main.show();
    windows.main.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 680,
    minHeight: 560,
    frame: false,
    // Sem transparent:true — ver comentário completo em showLogin sobre o
    // bug de "layered window" que isso causava.
    transparent: false,
    backgroundColor: OPAQUE_FALLBACK_BG,
    icon: iconPath(),
    hasShadow: false,
    // De propósito SEM backgroundMaterial/vibrancy nativo aqui: esses
    // materiais do SO pintam o retângulo INTEIRO da janela, competindo com
    // o backgroundColor opaco (mesmo motivo do painel flutuante, ver
    // showFloatingPanel). Efeito vidro fica só no CSS (.allus-glass,
    // backdrop-filter).
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  loadPage(win, 'main');
  hideInsteadOfClose(win);
  win.on('closed', () => {
    windows.main = null;
  });
  windows.main = win;
}

export function showFloatingPanel(): void {
  if (windows.floating && !windows.floating.isDestroyed()) {
    windows.floating.show();
    return;
  }

  const snapshot = appStore.getSnapshot();
  const sizeLocked = snapshot.floatingPanelSizeLocked ?? false;
  const hasActiveSession = snapshot.activeSession?.status === 'Ativo';

  // O "modo compacto" foi removido da interface (a janela sempre renderiza
  // o layout normal agora), mas contas com a preferência antiga ainda
  // gravada (floatingPanelIsCompactMode: true) abriam a janela em ~218x54px
  // — pequena demais pro layout atual, deixando os botões inacessíveis.
  // Ignoramos essa preferência aqui e sempre usamos o tamanho normal.
  let width: number;
  let height: number;
  const savedSize = snapshot.floatingPanelSize;
  if (savedSize?.width && savedSize?.height) {
    width = savedSize.width;
    height = savedSize.height;
  } else if (snapshot.floatingPanelExpanded) {
    width = hasActiveSession ? 429 : 307;
    height = hasActiveSession ? 479 : 390;
  } else {
    // Painel recolhido (padrão): tamanho compacto estilo widget minimalista
    width = 300;
    height = hasActiveSession ? 320 : 280;
  }

  const win = new BrowserWindow({
    width,
    height,
    x: undefined,
    y: undefined,
    frame: false,
    transparent: true,
    // ATENÇÃO: o painel flutuante é a ÚNICA janela do app com transparência
    // REAL (as outras usam OPAQUE_FALLBACK_BG — ver comentário na constante
    // acima sobre o vazamento de wallpaper que isso causava no build
    // empacotado). O painel escapa desse bug e mantém alpha zero de
    // verdade porque floatingPanelOpacity pode chegar a 0% (slider) e um
    // fallback opaco faria o Chromium misturar o rgba(...) do CSS contra
    // preto opaco em vez do desktop de verdade. De propósito SEM
    // backgroundMaterial/vibrancy nativo aqui: reintroduziria o bug do
    // slider não chegar a 0% (já corrigido nos commits c826d89/7c49803).
    // Este painel usa só o backdrop-filter do CSS (.allus-glass), que
    // respeita o alpha da janela de verdade.
    backgroundColor: TRANSPARENT_BG,
    icon: iconPath(),
    resizable: !sizeLocked,
    minWidth: 100,
    minHeight: 110,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadPage(win, 'floating');

  // Salvar tamanho quando usuário redimensiona manualmente (com debounce).
  // Resizes programáticos (auto-fit) são ignorados aqui — ver
  // markProgrammaticFloatingResize acima.
  win.on('resized', () => {
    if (isProgrammaticFloatingResize) return;
    if (appStore.getSnapshot().floatingPanelSizeLocked) return;
    if (floatingResizeTimeout) clearTimeout(floatingResizeTimeout);

    floatingResizeTimeout = setTimeout(() => {
      const bounds = win.getBounds();
      const size = { width: bounds.width, height: bounds.height };
      appStore.patch({ floatingPanelSize: size });
      authManager.updatePreferences({ floatingPanelSize: size }).catch((err) => {
        console.error('[floating] falha ao salvar tamanho do painel', err);
      });
    }, 300);
  });

  windows.floating = win;
}

export function hideFloatingPanel(): void {
  windows.floating?.hide();
}

export function unhideFloatingPanel(): void {
  windows.floating?.show();
}

export function toggleTaskCenter(): void {
  if (windows.taskCenter && !windows.taskCenter.isDestroyed() && windows.taskCenter.isVisible()) {
    windows.taskCenter.close();
  } else {
    showTaskCenter();
  }
}

export function toggleTimeCenter(): void {
  if (windows.timeCenter && !windows.timeCenter.isDestroyed() && windows.timeCenter.isVisible()) {
    windows.timeCenter.close();
  } else {
    showTimeCenter();
  }
}

export function toggleDashboard(): void {
  if (windows.dashboard && !windows.dashboard.isDestroyed() && windows.dashboard.isVisible()) {
    windows.dashboard.close();
  } else {
    showDashboard();
  }
}

export function togglePulse(): void {
  if (windows.pulse && !windows.pulse.isDestroyed() && windows.pulse.isVisible()) {
    windows.pulse.close();
  } else {
    showPulse();
  }
}

export function setFloatingPanelSizeLocked(locked: boolean): void {
  if (windows.floating && !windows.floating.isDestroyed()) {
    windows.floating.setResizable(!locked);
  }
}

export function resetFloatingPanelToNormal(): void {
  // O "modo compacto" foi removido da interface — essa função só existe
  // porque window:openFloating ainda a chama; não faz mais nada.
}

export function showTaskCenter(): void {
  if (windows.taskCenter && !windows.taskCenter.isDestroyed()) {
    windows.taskCenter.show();
    windows.taskCenter.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 760,
    height: 620,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    // Sem transparent:true — ver comentário completo em showLogin sobre o
    // bug de "layered window" que isso causava.
    transparent: false,
    backgroundColor: OPAQUE_FALLBACK_BG,
    icon: iconPath(),
    hasShadow: false,
    // De propósito SEM backgroundMaterial/vibrancy nativo aqui: esses
    // materiais do SO pintam o retângulo INTEIRO da janela, competindo com
    // o backgroundColor opaco (mesmo motivo do painel flutuante, ver
    // showFloatingPanel). Efeito vidro fica só no CSS (.allus-glass,
    // backdrop-filter).
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  loadPage(win, 'taskCenter');
  hideInsteadOfClose(win);
  win.on('closed', () => {
    windows.taskCenter = null;
  });
  windows.taskCenter = win;
}

export function showTimeCenter(): void {
  if (windows.timeCenter && !windows.timeCenter.isDestroyed()) {
    windows.timeCenter.show();
    windows.timeCenter.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 680,
    minHeight: 480,
    frame: false,
    // Sem transparent:true — ver comentário completo em showLogin sobre o
    // bug de "layered window" que isso causava.
    transparent: false,
    backgroundColor: OPAQUE_FALLBACK_BG,
    icon: iconPath(),
    hasShadow: false,
    // De propósito SEM backgroundMaterial/vibrancy nativo aqui: esses
    // materiais do SO pintam o retângulo INTEIRO da janela, competindo com
    // o backgroundColor opaco (mesmo motivo do painel flutuante, ver
    // showFloatingPanel). Efeito vidro fica só no CSS (.allus-glass,
    // backdrop-filter).
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  loadPage(win, 'timeCenter');
  hideInsteadOfClose(win);
  win.on('closed', () => {
    windows.timeCenter = null;
  });
  windows.timeCenter = win;
}

export function showDashboard(): void {
  if (windows.dashboard && !windows.dashboard.isDestroyed()) {
    windows.dashboard.show();
    windows.dashboard.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    // Sem transparent:true — ver comentário completo em showLogin sobre o
    // bug de "layered window" que isso causava.
    transparent: false,
    backgroundColor: OPAQUE_FALLBACK_BG,
    icon: iconPath(),
    hasShadow: false,
    // De propósito SEM backgroundMaterial/vibrancy nativo aqui: esses
    // materiais do SO pintam o retângulo INTEIRO da janela, competindo com
    // o backgroundColor opaco (mesmo motivo do painel flutuante, ver
    // showFloatingPanel). Efeito vidro fica só no CSS (.allus-glass,
    // backdrop-filter).
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  loadPage(win, 'dashboard');
  hideInsteadOfClose(win);
  win.on('closed', () => {
    windows.dashboard = null;
  });
  windows.dashboard = win;
}

export function showPulse(): void {
  if (windows.pulse && !windows.pulse.isDestroyed()) {
    windows.pulse.show();
    windows.pulse.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    // Sem transparent:true — ver comentário completo em showLogin sobre o
    // bug de "layered window" que isso causava.
    transparent: false,
    backgroundColor: OPAQUE_FALLBACK_BG,
    icon: iconPath(),
    hasShadow: false,
    // De propósito SEM backgroundMaterial/vibrancy nativo aqui: esses
    // materiais do SO pintam o retângulo INTEIRO da janela, competindo com
    // o backgroundColor opaco (mesmo motivo do painel flutuante, ver
    // showFloatingPanel). Efeito vidro fica só no CSS (.allus-glass,
    // backdrop-filter).
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  loadPage(win, 'pulse');
  hideInsteadOfClose(win);
  win.on('closed', () => {
    windows.pulse = null;
  });
  windows.pulse = win;
}

export function closeAllAppWindows(): void {
  for (const key of ['main', 'taskCenter', 'timeCenter', 'dashboard', 'pulse', 'floating'] as const) {
    windows[key]?.close();
    windows[key] = null;
  }
}

export function broadcast(snapshot: AppSnapshot): void {
  for (const win of Object.values(windows)) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('state:update', snapshot);
    }
  }
}

export function anyVisibleWindow(): boolean {
  return Object.values(windows).some((w) => w && !w.isDestroyed() && w.isVisible());
}

app.on('before-quit', () => setQuitting(true));
