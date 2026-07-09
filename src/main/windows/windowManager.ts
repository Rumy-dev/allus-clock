import { BrowserWindow, app } from 'electron';
import path from 'node:path';
import type { AppSnapshot } from '../../shared/ipc-contract';
import { appStore } from '../store/appStore';
import { authManager } from '../auth/authManager';
import * as timerEngine from '../store/timerEngine';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let isQuitting = false;
export function setQuitting(value: boolean): void {
  isQuitting = value;
}

let floatingPanelCompactMode = false;
let floatingResizeTimeout: NodeJS.Timeout | null = null;

const windows: {
  login: BrowserWindow | null;
  main: BrowserWindow | null;
  floating: BrowserWindow | null;
  taskCenter: BrowserWindow | null;
  timeCenter: BrowserWindow | null;
  dashboard: BrowserWindow | null;
  pulse: BrowserWindow | null;
} = { login: null, main: null, floating: null, taskCenter: null, timeCenter: null, dashboard: null, pulse: null };

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
// Cmd+T nova aba) sempre que o Allus Clock estava rodando em segundo
// plano, o que é o tempo todo (ele vive na bandeja). before-input-event só
// dispara quando a própria janela do Allus Clock está em foco.
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
    transparent: true,
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
    transparent: true,
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
  floatingPanelCompactMode = snapshot.floatingPanelIsCompactMode ?? false;
  const sizeLocked = snapshot.floatingPanelSizeLocked ?? false;
  const hasActiveSession = snapshot.activeSession?.status === 'Ativo';

  let width: number;
  let height: number;

  if (floatingPanelCompactMode) {
    const savedSize = snapshot.floatingPanelCompactSize;
    if (savedSize?.width && savedSize?.height) {
      width = savedSize.width;
      height = savedSize.height;
    } else {
      width = hasActiveSession ? 285 : 218;
      height = hasActiveSession ? 57 : 54;
    }
  } else {
    const savedSize = snapshot.floatingPanelSize;
    if (savedSize?.width && savedSize?.height) {
      width = savedSize.width;
      height = savedSize.height;
    } else {
      width = hasActiveSession ? 429 : 307;
      height = hasActiveSession ? 479 : 390;
    }
  }

  const win = new BrowserWindow({
    width,
    height,
    x: undefined,
    y: undefined,
    frame: false,
    transparent: true,
    resizable: !sizeLocked,
    minWidth: 100,
    minHeight: 110,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadPage(win, 'floating');

  // Salvar tamanho quando usuário redimensiona manualmente (com debounce)
  win.on('resized', () => {
    if (appStore.getSnapshot().floatingPanelSizeLocked) return;
    if (floatingResizeTimeout) clearTimeout(floatingResizeTimeout);

    floatingResizeTimeout = setTimeout(() => {
      const bounds = win.getBounds();
      const size = { width: bounds.width, height: bounds.height };

      if (floatingPanelCompactMode) {
        appStore.patch({ floatingPanelCompactSize: size });
        authManager.updatePreferences({ floatingPanelCompactSize: size }).catch(() => {});
      } else {
        appStore.patch({ floatingPanelSize: size });
        authManager.updatePreferences({ floatingPanelSize: size }).catch(() => {});
      }
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
  // Quando abre via botão na página principal, resetar para modo normal
  floatingPanelCompactMode = false;
}

export function setFloatingPanelCompactMode(isCompact: boolean): void {
  floatingPanelCompactMode = isCompact;
  if (!windows.floating || windows.floating.isDestroyed()) return;

  const snapshot = appStore.getSnapshot();
  const hasActiveSession = snapshot.activeSession?.status === 'Ativo';

  if (isCompact) {
    // Muda para tamanho do modo compacto
    const compactSize = snapshot.floatingPanelCompactSize;
    let width: number;
    let height: number;

    if (compactSize) {
      width = compactSize.width;
      height = compactSize.height;
    } else {
      // Usar tamanho padrão baseado no estado
      if (hasActiveSession) {
        width = 285;  // Compacto rodando
        height = 57;
      } else {
        width = 218;  // Compacto parado
        height = 54;
      }
    }

    const bounds = windows.floating.getBounds();
    windows.floating.setBounds({ ...bounds, width, height });
  } else {
    // Muda para tamanho do modo normal
    const normalSize = snapshot.floatingPanelSize;
    let width: number;
    let height: number;

    if (normalSize) {
      width = normalSize.width;
      height = normalSize.height;
    } else {
      // Usar tamanho padrão baseado no estado
      if (hasActiveSession) {
        width = 429;  // Normal rodando
        height = 479;
      } else {
        width = 307;  // Normal parado
        height = 390;
      }
    }

    const bounds = windows.floating.getBounds();
    windows.floating.setBounds({ ...bounds, width, height });
  }

  // Salvar o estado do modo (será sincronizado via IPC, mas pode ser chamado direto também)
  appStore.patch({ floatingPanelIsCompactMode: isCompact });
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
    transparent: true,
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
    transparent: true,
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
    transparent: true,
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
    transparent: true,
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
