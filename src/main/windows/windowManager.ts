import { BrowserWindow, app } from 'electron';
import path from 'node:path';
import type { AppSnapshot } from '../../shared/ipc-contract';
import { appStore } from '../store/appStore';
import { authManager } from '../auth/authManager';

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

  // Restaurar o modo (compacto ou normal)
  floatingPanelCompactMode = snapshot.floatingPanelIsCompactMode;

  // Restaurar o tamanho apropriado para o modo
  let width: number;
  let height: number;

  if (floatingPanelCompactMode) {
    const savedCompactSize = snapshot.floatingPanelCompactSize;
    width = savedCompactSize?.width ?? 280;
    height = savedCompactSize?.height ?? 110;
  } else {
    const savedNormalSize = snapshot.floatingPanelSize;
    width = savedNormalSize?.width ?? 280;
    height = savedNormalSize?.height ?? 320;
  }

  const win = new BrowserWindow({
    width,
    height,
    x: undefined,
    y: undefined,
    frame: false,
    transparent: true,
    resizable: true,
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
    if (floatingResizeTimeout) clearTimeout(floatingResizeTimeout);

    floatingResizeTimeout = setTimeout(() => {
      const bounds = win.getBounds();
      const size = { width: bounds.width, height: bounds.height };

      if (floatingPanelCompactMode) {
        appStore.patch({ floatingPanelCompactSize: size });
        authManager.updatePreferences({ floatingPanelCompactSize: size }).catch(() => {
          // Se falhar (offline), o estado local já foi atualizado
        });
      } else {
        appStore.patch({ floatingPanelSize: size });
        authManager.updatePreferences({ floatingPanelSize: size }).catch(() => {
          // Se falhar (offline), o estado local já foi atualizado
        });
      }
    }, 300); // Aguarda 300ms após o último resize antes de salvar
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

export function setFloatingPanelCompactMode(isCompact: boolean): void {
  floatingPanelCompactMode = isCompact;
  if (!windows.floating || windows.floating.isDestroyed()) return;

  const snapshot = appStore.getSnapshot();

  if (isCompact) {
    // Muda para tamanho do modo compacto
    const compactSize = snapshot.floatingPanelCompactSize;
    const width = compactSize?.width ?? 280;
    const height = compactSize?.height ?? 110;
    const bounds = windows.floating.getBounds();
    windows.floating.setBounds({ ...bounds, width, height });
  } else {
    // Muda para tamanho do modo normal
    const normalSize = snapshot.floatingPanelSize;
    const width = normalSize?.width ?? 280;
    const height = normalSize?.height ?? 320;
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
