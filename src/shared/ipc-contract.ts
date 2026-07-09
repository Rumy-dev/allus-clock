import type {
  Client,
  DateRangeFilter,
  PomoMode,
  PomoSession,
  PomoTaskLog,
  Profile,
  Project,
  Task,
  TeamMember,
  TimeReportPerson,
} from './types';

// Snapshot de estado transmitido do processo main para todas as janelas
// renderer via broadcast ('state:update'), a cada tick e a cada mutação.
export interface AppSnapshot {
  auth: {
    status: 'signedOut' | 'signedIn';
    profile: Profile | null;
  };
  online: boolean;
  selectedMode: PomoMode;
  selectedProjectId: string | null;
  activeSession: PomoSession | null;
  activeTaskLogs: PomoTaskLog[];
  recentSessions: PomoSession[];
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  soundEnabled: boolean;
  floatingMinimizable: boolean;
  floatingPanelOpacity: number;
  floatingPanelSize: { width: number; height: number } | null;
  floatingPanelCompactSize: { width: number; height: number } | null;
  floatingPanelIsCompactMode: boolean;
  floatingPanelSizeLocked: boolean;
  floatingPanelExpanded: boolean;
  autoLaunchEnabled: boolean;
  recentTasks: PomoTaskLog[]; // últimas 3 tarefas distintas, p/ troca rápida
  profiles: TeamMember[]; // roster do time, p/ "criado por" etc
}

export interface TimeReportResult {
  people: TimeReportPerson[];
  totalSeconds: number;
}

// Canais invocáveis pelo renderer (ipcRenderer.invoke)
export interface IpcInvokeMap {
  'auth:signIn': (args: { email: string; password: string }) => { ok: true } | { ok: false; error: string };
  'auth:signOut': () => void;
  'auth:changePassword': (args: { newPassword: string }) => { ok: true } | { ok: false; error: string };

  'timer:playPause': () => void;
  'timer:pause': () => void;
  'timer:resume': () => void;
  'timer:stop': () => void;
  'timer:skipToFocus': () => void;
  'timer:skipToBreak': () => void;
  'timer:restart': (args: { sessionId: string }) => void;
  'timer:setMode': (args: { mode: PomoMode }) => void;
  'session:delete': (args: { sessionId: string }) => void;

  'task:quickAdd': (args: { title: string; avulsa: boolean }) => void;
  'task:focus': (args: { taskId: string | null; subtaskId: string | null; title: string }) => void;
  'task:toggleDone': (args: { taskLogId: string }) => void;
  'task:deleteLog': (args: { taskLogId: string }) => void;

  'project:add': (args: { clientName: string; projectName: string; type: string }) => void;
  'project:update': (args: { projectId: string; clientName: string; projectName: string; type: string }) => void;
  'project:delete': (args: { projectId: string }) => void;
  'project:select': (args: { projectId: string | null }) => void;
  'client:delete': (args: { clientId: string }) => void;

  'taskTree:add': (args: { projectId: string; parentTaskId: string | null; title: string }) => void;
  'taskTree:rename': (args: { taskId: string; title: string }) => void;
  'taskTree:toggleDone': (args: { taskId: string }) => void;
  'taskTree:delete': (args: { taskId: string }) => void;
  'taskTree:move': (args: { taskId: string; targetProjectId: string }) => void;

  'report:query': (args: { range: DateRangeFilter }) => TimeReportResult;
  'report:exportCsv': (args: { range: DateRangeFilter }) => { path: string } | { error: string };
  'session:list': (args: { range: DateRangeFilter }) => PomoSession[];
  'dashboard:trend': (args: {
    range: DateRangeFilter;
    clientId?: string;
    projectId?: string;
    userId?: string;
  }) => { date: string; totalSeconds: number }[];

  'pulse:query': () => import('./types').PulseResult;

  'prefs:setSound': (args: { enabled: boolean }) => void;
  'prefs:setFloatingMinimizable': (args: { enabled: boolean }) => void;
  'prefs:setFloatingPanelOpacity': (args: { opacity: number }) => void;
  'prefs:setFloatingPanelSize': (args: { size: { width: number; height: number } | null }) => void;
  'prefs:setFloatingPanelSizeLocked': (args: { locked: boolean }) => void;
  'prefs:setFloatingPanelExpanded': (args: { expanded: boolean }) => void;
  'prefs:setNotify': (args: { event: 'focusStart' | 'focusEnd' | 'breakEnd'; enabled: boolean }) => void;
  'prefs:setAutoLaunch': (args: { enabled: boolean }) => void;
  'account:updateName': (args: { fullName: string }) => void;

  'window:openTaskCenter': () => void;
  'window:openTimeCenter': () => void;
  'window:openDashboard': () => void;
  'window:openPulse': () => void;
  'window:openMain': () => void;
  'window:openFloating': () => void;
  'window:toggleTaskCenter': () => void;
  'window:toggleTimeCenter': () => void;
  'window:toggleDashboard': () => void;
  'window:togglePulse': () => void;
  'window:minimizeSelf': () => void;
  'window:closeSelf': () => void;
  'window:setFloatingHeight': (args: { width?: number; height?: number }) => void;
  'window:setFloatingSizeLocked': (args: { locked: boolean }) => void;
  'window:openDevTools': () => void;
  'state:get': () => AppSnapshot;
}

export type IpcChannel = keyof IpcInvokeMap;
