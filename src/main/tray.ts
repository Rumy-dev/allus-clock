import { Menu, Tray, app, nativeImage } from 'electron';
import path from 'node:path';
import { appStore } from './store/appStore';
import * as timerEngine from './store/timerEngine';
import * as windowManager from './windows/windowManager';
import { authManager } from './auth/authManager';
import { POMO_MODES, formatDuration } from '../shared/types';
import type { PomoMode } from '../shared/types';

let tray: Tray | null = null;

function assetsDir(): string {
  // Em dev, __dirname aponta pra .vite/build; em produção, os assets vão
  // junto via packagerConfig.extraResource (forge.config.ts).
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '..', '..', 'assets');
}

function trayIcon() {
  const image = nativeImage.createFromPath(path.join(assetsDir(), 'icon.png'));
  // macOS: menu bar icons devem ser pequenos (16x16); o resto do espaço é
  // ocupado pelo título via setTitle(). No Windows/Linux a tray aceita um
  // ícone maior sem texto ao lado.
  const size = process.platform === 'darwin' ? 16 : 32;
  return image.resize({ width: size, height: size });
}

export function initTray(): void {
  if (tray) return;
  tray = new Tray(trayIcon());
  tray.setToolTip('Allus Focus');
  tray.on('double-click', () => windowManager.showMainWindow());
  render();
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}

export function render(): void {
  if (!tray) return;
  const snapshot = appStore.getSnapshot();
  const authState = authManager.getState();
  const isAdmin = authState.status === 'signedIn' && authState.profile.role === 'admin';
  const session = snapshot.activeSession;
  const timeLabel = session ? formatDuration(Math.max(0, session.plannedSeconds - session.elapsedSeconds)) : '--:--';

  // No Windows não existe texto ao lado do ícone da bandeja como no
  // macOS (NSStatusItem.title) — usamos o tooltip. No macOS, setTitle()
  // funciona e mostra o texto ao lado do ícone.
  tray.setToolTip(`Allus Focus — ${timeLabel}`);
  if (process.platform === 'darwin') {
    tray.setTitle(timeLabel);
  }

  const modeItem = (mode: PomoMode) => ({
    label: POMO_MODES[mode].menuTitle,
    type: 'radio' as const,
    checked: snapshot.selectedMode === mode,
    click: () => timerEngine.setMode(mode),
  });

  const menu = Menu.buildFromTemplate([
    { label: `Timer: ${timeLabel}`, enabled: false },
    { type: 'separator' },
    { label: 'Play / Pause', click: () => timerEngine.playPause() },
    { label: 'Stop', click: () => timerEngine.stop() },
    { type: 'separator' },
    modeItem('classic'),
    modeItem('deskTime'),
    modeItem('deepWork'),
    { type: 'separator' },
    { label: 'Abrir Allus Focus', click: () => windowManager.showMainWindow() },
    { label: 'Central de Tarefas', click: () => windowManager.showTaskCenter() },
    { label: 'Central de Tempos', click: () => windowManager.showTimeCenter() },
    ...(isAdmin ? [{ label: 'Allus Pulse', click: () => windowManager.showPulse() }] : []),
    { type: 'separator' },
    {
      label: 'Sair da conta',
      click: async () => {
        await authManager.signOut();
      },
    },
    {
      label: 'Sair do Allus Focus',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        windowManager.setQuitting(true);
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}
