import { BrowserWindow, app, ipcMain } from 'electron';
import { appStore } from './store/appStore';
import { authManager } from './auth/authManager';
import * as timerEngine from './store/timerEngine';
import * as taskStore from './store/taskStore';
import * as reportBuilder from './store/reportBuilder';
import * as pulseBuilder from './store/pulseBuilder';
import { savePrefs } from './store/prefsStore';
import * as windowManager from './windows/windowManager';
import type { IpcInvokeMap } from '../shared/ipc-contract';

function handle<K extends keyof IpcInvokeMap>(
  channel: K,
  fn: (args: Parameters<IpcInvokeMap[K]>[0]) => ReturnType<IpcInvokeMap[K]> | Promise<ReturnType<IpcInvokeMap[K]>>,
): void {
  ipcMain.handle(channel, async (_event, args) => {
    try {
      return await fn(args);
    } catch (err) {
      console.error(`[ipc:${channel}]`, err);
      throw err;
    }
  });
}

export function registerIpcHandlers(): void {
  handle('auth:signIn', async ({ email, password }) => authManager.signIn(email, password));
  handle('auth:signOut', async () => {
    await authManager.signOut();
  });
  handle('auth:changePassword', async ({ newPassword }) => authManager.changePassword(newPassword));

  handle('timer:playPause', async () => timerEngine.playPause());
  handle('timer:pause', async () => timerEngine.pause());
  handle('timer:resume', async () => timerEngine.resume());
  handle('timer:stop', async () => timerEngine.stop());
  handle('timer:skipToFocus', async () => timerEngine.skipToFocus());
  handle('timer:skipToBreak', async () => timerEngine.skipToBreak());
  handle('timer:restart', async ({ sessionId }) => timerEngine.restart(sessionId));
  handle('timer:setMode', async ({ mode }) => timerEngine.setMode(mode));
  handle('session:delete', async ({ sessionId }) => timerEngine.deleteSession(sessionId));

  handle('task:quickAdd', async ({ title, avulsa }) => timerEngine.quickAdd(title, avulsa));
  handle('task:focus', async ({ taskId, subtaskId, title }) => timerEngine.focusTask(taskId, subtaskId, title));
  handle('task:toggleDone', async ({ taskLogId }) => {
    const state = appStore.getSnapshot();
    const log = state.activeTaskLogs.find((l) => l.id === taskLogId);
    if (!log) return;
    const updated = { ...log, isDone: !log.isDone, completedAt: !log.isDone ? new Date().toISOString() : null };
    appStore.patch({ activeTaskLogs: state.activeTaskLogs.map((l) => (l.id === taskLogId ? updated : l)) });
    if (updated.taskId) await taskStore.setTaskNodeDone(updated.taskId, updated.isDone);
  });
  handle('task:deleteLog', async ({ taskLogId }) => timerEngine.deleteTaskLog(taskLogId));

  handle('project:add', async ({ clientName, projectName }) => taskStore.addProject(clientName, projectName));
  handle('project:update', async ({ projectId, clientName, projectName }) =>
    taskStore.updateProject(projectId, clientName, projectName),
  );
  handle('project:delete', async ({ projectId }) => taskStore.deleteProject(projectId));
  handle('project:select', async ({ projectId }) => {
    savePrefs({ selectedProjectId: projectId });
    appStore.patch({ selectedProjectId: projectId });
  });
  handle('client:delete', async ({ clientId }) => taskStore.deleteClient(clientId));

  handle('taskTree:add', async ({ projectId, parentTaskId, title }) => {
    await taskStore.addTaskNode(projectId, parentTaskId, title);
  });
  handle('taskTree:rename', async ({ taskId, title }) => taskStore.renameTaskNode(taskId, title));
  handle('taskTree:toggleDone', async ({ taskId }) => taskStore.toggleTaskNodeDone(taskId));
  handle('taskTree:delete', async ({ taskId }) => taskStore.deleteTaskNode(taskId));
  handle('taskTree:move', async ({ taskId, targetProjectId }) => taskStore.moveTaskNode(taskId, targetProjectId));

  handle('report:query', async ({ range }) => reportBuilder.queryReport(range));
  handle('report:exportCsv', async ({ range }) => reportBuilder.exportCsv(range));
  handle('session:list', async ({ range }) => reportBuilder.querySessions(range));
  handle('dashboard:trend', async ({ range, clientId, projectId, userId }) =>
    reportBuilder.queryTrend(range, { clientId, projectId, userId }),
  );

  handle('pulse:query', async () => {
    const state = authManager.getState();
    if (state.status !== 'signedIn' || state.profile.role !== 'admin') {
      throw new Error('Acesso negado: apenas admins podem acessar Allus Pulse.');
    }
    return pulseBuilder.queryPulse();
  });

  handle('prefs:setSound', async ({ enabled }) => {
    await authManager.updatePreferences({ soundEnabled: enabled });
    appStore.patch({ soundEnabled: enabled });
  });
  handle('prefs:setFloatingMinimizable', async ({ enabled }) => {
    await authManager.updatePreferences({ floatingMinimizable: enabled });
    appStore.patch({ floatingMinimizable: enabled });
  });
  handle('prefs:setFloatingPanelOpacity', async ({ opacity }) => {
    const clamped = Math.max(0, Math.min(100, opacity));
    await authManager.updatePreferences({ floatingPanelOpacity: clamped });
    appStore.patch({ floatingPanelOpacity: clamped });
  });
  handle('prefs:setFloatingPanelSize', async ({ size }) => {
    await authManager.updatePreferences({ floatingPanelSize: size });
    appStore.patch({ floatingPanelSize: size });
  });
  handle('prefs:setFloatingPanelCompactSize', async ({ size }) => {
    await authManager.updatePreferences({ floatingPanelCompactSize: size });
    appStore.patch({ floatingPanelCompactSize: size });
  });
  handle('prefs:setFloatingPanelIsCompactMode', async ({ isCompact }) => {
    await authManager.updatePreferences({ floatingPanelIsCompactMode: isCompact });
    appStore.patch({ floatingPanelIsCompactMode: isCompact });
  });
  handle('prefs:setFloatingPanelSizeLocked', async ({ locked }) => {
    await authManager.updatePreferences({ floatingPanelSizeLocked: locked });
    appStore.patch({ floatingPanelSizeLocked: locked });
  });
  handle('prefs:setNotify', async ({ event, enabled }) => {
    const key = (`notify${event.charAt(0).toUpperCase()}${event.slice(1)}`) as
      | 'notifyFocusStart'
      | 'notifyFocusEnd'
      | 'notifyBreakEnd';
    await authManager.updatePreferences({ [key]: enabled });
  });
  handle('account:updateName', async ({ fullName }) => authManager.updateFullName(fullName));
  handle('prefs:setAutoLaunch', async ({ enabled }) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
    appStore.patch({ autoLaunchEnabled: enabled });
  });

  handle('state:get', async () => appStore.getSnapshot());

  handle('window:openTaskCenter', async () => windowManager.showTaskCenter());
  handle('window:openTimeCenter', async () => windowManager.showTimeCenter());
  handle('window:openDashboard', async () => windowManager.showDashboard());
  handle('window:openPulse', async () => windowManager.showPulse());
  handle('window:openMain', async () => windowManager.showMainWindow());
  handle('window:openFloating', async () => {
    windowManager.resetFloatingPanelToNormal();
    windowManager.showFloatingPanel();
  });

  handle('window:toggleTaskCenter', async () => windowManager.toggleTaskCenter());
  handle('window:toggleTimeCenter', async () => windowManager.toggleTimeCenter());
  handle('window:toggleDashboard', async () => windowManager.toggleDashboard());
  handle('window:togglePulse', async () => windowManager.togglePulse());

  ipcMain.handle('window:minimizeSelf', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle('window:closeSelf', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.hide();
    }
  });
  ipcMain.handle('window:openDevTools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.webContents.toggleDevTools();
    }
  });
  ipcMain.handle('window:setFloatingHeight', (_event, { width, height }: { width?: number; height?: number }) => {
    if (appStore.getSnapshot().floatingPanelSizeLocked) return;
    const win = BrowserWindow.fromWebContents(_event.sender);
    if (win) {
      const bounds = win.getBounds();
      win.setBounds({
        ...bounds,
        width: width !== undefined ? Math.min(Math.max(width, 200), 700) : bounds.width,
        height: height !== undefined ? Math.min(Math.max(height, 50), 700) : bounds.height,
      });
    }
  });

  ipcMain.handle('window:setFloatingCompactMode', async (_event, { isCompact }: { isCompact: boolean }) => {
    windowManager.setFloatingPanelCompactMode(isCompact);
  });

  ipcMain.handle('window:setFloatingSizeLocked', async (_event, { locked }: { locked: boolean }) => {
    windowManager.setFloatingPanelSizeLocked(locked);
  });

}
