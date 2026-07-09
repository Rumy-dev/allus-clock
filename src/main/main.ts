import { app, globalShortcut, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';
import { authManager } from './auth/authManager';
import { appStore } from './store/appStore';
import * as taskStore from './store/taskStore';
import * as timerEngine from './store/timerEngine';
import * as windowManager from './windows/windowManager';
import * as tray from './tray';
import { registerIpcHandlers } from './ipcHandlers';

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

app.on('before-quit', () => windowManager.setQuitting(true));

let wasSignedIn = false;
let wasOnline = true;

app.whenReady().then(async () => {
  registerIpcHandlers();
  appStore.patch({ autoLaunchEnabled: app.getLoginItemSettings().openAtLogin });

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
        floatingMinimizable: state.profile.preferences.floatingMinimizable,
        floatingPanelOpacity: state.profile.preferences.floatingPanelOpacity,
        selectedMode: state.profile.preferences.selectedMode,
      });

      if (!wasSignedIn) {
        wasSignedIn = true;
        windowManager.closeLogin();
        await taskStore.hydrateTaxonomy();
        await timerEngine.loadMostUsedTasks();
        taskStore.subscribeRealtime();
        windowManager.showMainWindow();
        windowManager.showFloatingPanel();
        tray.initTray();
      }
    } else {
      wasSignedIn = false;
      appStore.patch({ auth: { status: 'signedOut', profile: null } });
      await taskStore.unsubscribeRealtime();
    }
  });

  // authManager.init() já dispara 'change' internamente (via hydrateProfile)
  // quando havia uma sessão salva — o handler acima cuida de todo o setup
  // nesse caso. Só precisamos abrir a tela de Login quando não há sessão.
  const initialState = await authManager.init();
  if (initialState.status !== 'signedIn') {
    windowManager.showLogin();
  }

  // Registrar atalhos globais de teclado
  globalShortcut.register('Escape', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && focusedWindow.isVisible()) {
      focusedWindow.close();
    }
  });
});

app.on('activate', () => {
  if (authManager.getState().status === 'signedIn') {
    windowManager.showMainWindow();
  } else {
    windowManager.showLogin();
  }
});
