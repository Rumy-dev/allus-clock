import type { AppSnapshot } from '../../shared/ipc-contract';
import { loadPrefs } from './prefsStore';
import { DEFAULT_PREFERENCES } from '../../shared/types';

type Listener = (snapshot: AppSnapshot) => void;

const prefs = loadPrefs();

// soundEnabled/floatingMinimizable/selectedMode começam nos defaults e são
// substituídos pelos valores da conta (profiles.preferences) assim que o
// login acontece — ver main.ts e authManager.ts.
let state: AppSnapshot = {
  auth: { status: 'signedOut', profile: null },
  online: true,
  selectedMode: DEFAULT_PREFERENCES.selectedMode,
  selectedProjectId: prefs.selectedProjectId,
  activeSession: null,
  activeTaskLogs: [],
  recentSessions: [],
  clients: [],
  projects: [],
  tasks: [],
  soundEnabled: DEFAULT_PREFERENCES.soundEnabled,
  floatingMinimizable: DEFAULT_PREFERENCES.floatingMinimizable,
  floatingPanelOpacity: DEFAULT_PREFERENCES.floatingPanelOpacity,
  floatingPanelSize: DEFAULT_PREFERENCES.floatingPanelSize,
  floatingPanelCompactSize: DEFAULT_PREFERENCES.floatingPanelCompactSize,
  floatingPanelIsCompactMode: DEFAULT_PREFERENCES.floatingPanelIsCompactMode,
  autoLaunchEnabled: false,
  recentTasks: [],
  profiles: [],
};

const listeners = new Set<Listener>();

export const appStore = {
  getSnapshot(): AppSnapshot {
    return state;
  },
  patch(partial: Partial<AppSnapshot>): void {
    state = { ...state, ...partial };
    for (const listener of listeners) listener(state);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
