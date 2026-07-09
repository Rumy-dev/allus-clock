// Modelos de dados compartilhados entre main e renderer.
// Espelham o schema Postgres em supabase/schema.sql.

export type PomoMode = 'classic' | 'deskTime' | 'deepWork';

export interface PomoModeConfig {
  mode: PomoMode;
  title: string;
  menuTitle: string;
  tableTitle: string;
  focusSeconds: number;
  breakSeconds: number;
  icon: string;
}

export const POMO_MODES: Record<PomoMode, PomoModeConfig> = {
  classic: {
    mode: 'classic',
    title: 'Classic',
    menuTitle: 'Modo: Classic (25 min)',
    tableTitle: 'Classic',
    focusSeconds: 25 * 60,
    breakSeconds: 5 * 60,
    icon: 'timer',
  },
  deskTime: {
    mode: 'deskTime',
    title: 'DeskTime',
    menuTitle: 'Modo: DeskTime (52 min)',
    tableTitle: 'DeskTime',
    focusSeconds: 52 * 60,
    breakSeconds: 17 * 60,
    icon: 'desktopcomputer',
  },
  deepWork: {
    mode: 'deepWork',
    title: 'Deep Work',
    menuTitle: 'Modo: Deep Work (90 min)',
    tableTitle: 'Deep Work',
    focusSeconds: 90 * 60,
    breakSeconds: 20 * 60,
    icon: 'brain.head.profile',
  },
};

export const DEFAULT_MODE: PomoMode = 'deepWork';

export type CycleKind = 'Foco' | 'Pausa';

export type SessionStatus = 'Ativo' | 'Pausado' | 'Concluído' | 'Interrompido';

export type SessionDateFilter =
  | 'Todas'
  | 'Hoje'
  | 'Ontem'
  | 'Mês'
  | '7 dias'
  | 'Intervalo';

export interface DateRangeFilter {
  filter: SessionDateFilter;
  start?: string; // ISO 8601, só usado quando filter === 'Intervalo'
  end?: string; // ISO 8601
}

export interface UserPreferences {
  selectedMode: PomoMode;
  soundEnabled: boolean;
  floatingMinimizable: boolean;
  floatingPanelOpacity: number; // 0-100, quanto mais alto mais opaco
  floatingPanelSize: { width: number; height: number } | null; // null = auto-fit (modo normal)
  floatingPanelCompactSize: { width: number; height: number } | null; // null = default (modo compacto)
  floatingPanelIsCompactMode: boolean; // true = modo compacto, false = modo normal
  floatingPanelSizeLocked: boolean; // true = tamanho travado, ignora auto-resize e não é redimensionável
  floatingPanelExpanded: boolean; // true = drawer de extras (recentes, histórico, config) aberto
  notifyFocusStart: boolean;
  notifyFocusEnd: boolean;
  notifyBreakEnd: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  selectedMode: DEFAULT_MODE,
  soundEnabled: true,
  floatingMinimizable: false,
  floatingPanelOpacity: 90,
  floatingPanelSize: null,
  floatingPanelCompactSize: null,
  floatingPanelIsCompactMode: false,
  floatingPanelSizeLocked: false,
  floatingPanelExpanded: false,
  notifyFocusStart: true,
  notifyFocusEnd: true,
  notifyBreakEnd: true,
};

export interface Profile {
  id: string;
  fullName: string;
  createdAt: string;
  preferences: UserPreferences;
  role: 'member' | 'admin';
}

// Roster leve do time (usado p/ mostrar "criado por" sem carregar o
// perfil inteiro de todo mundo).
export interface TeamMember {
  id: string;
  fullName: string;
}

export interface Client {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  type: string;
  budgetHours: number | null;
  createdBy: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  isDone: boolean;
  createdBy: string;
  createdAt: string;
}

export interface PomoSession {
  id: string;
  userId: string;
  task: string;
  mode: PomoMode;
  cycleKind: CycleKind;
  plannedSeconds: number;
  elapsedSeconds: number;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  activeTaskLogId: string | null;
  syncedAt?: string; // ISO 8601, quando foi sincronizado com o Supabase
}

export interface PomoTaskLog {
  id: string;
  sessionId: string;
  taskId: string | null;
  projectId: string | null;
  clientId: string | null;
  userId: string;
  taskTitle: string;
  elapsedSeconds: number;
  isDone: boolean;
  startedAt: string;
  completedAt: string | null;
}

// Estruturas de relatório (calculadas em memória a partir de task_logs)

export interface TimeReportSubtask {
  id: string;
  title: string;
  totalSeconds: number;
  sessionCount: number;
}

export interface TimeReportTask {
  id: string;
  title: string;
  directSeconds: number;
  subtasks: TimeReportSubtask[];
  totalSeconds: number;
  totalSessionCount: number;
}

export interface TimeReportProject {
  id: string;
  projectName: string;
  tasks: TimeReportTask[];
  totalSeconds: number;
}

export interface TimeReportClient {
  id: string;
  clientName: string;
  projects: TimeReportProject[];
  totalSeconds: number;
}

export interface TimeReportPerson {
  userId: string;
  fullName: string;
  clients: TimeReportClient[];
  totalSeconds: number;
}

export const AVULSO_CLIENT_NAME = 'Avulso';
export const AVULSO_PROJECT_NAME = 'Avulso';

export function progress(session: Pick<PomoSession, 'elapsedSeconds' | 'plannedSeconds'>): number {
  return session.elapsedSeconds / Math.max(1, session.plannedSeconds);
}

export function displayPath(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p && p.length > 0).join(' / ');
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Estruturas para Allus Pulse (painel ao vivo da equipe)

export interface PulseTeamMember {
  userId: string;
  fullName: string;
  status: SessionStatus | 'offline'; // 'Ativo', 'Pausado', 'Concluído', 'Interrompido', ou 'offline' se sem sessão ativa
  currentTaskTitle: string | null;
  clientName: string | null;
  projectName: string | null;
  elapsedSeconds: number; // tempo decorrido na sessão ativa (ou 0 se offline)
  plannedSeconds: number; // tempo planejado da sessão (ou 0 se offline)
  lastActivityAt: string | null; // ISO 8601, mais recente started_at deste usuário
  todayTotalSeconds: number; // horas acumuladas hoje (de task_logs)
  syncedAt?: string; // ISO 8601, quando o tempo foi sincronizado com o servidor (para calcular ao vivo)
}

export interface PulseProjectBudget {
  projectId: string;
  projectName: string;
  budgetHours: number;
  loggedHours: number;
  pct: number; // 0-100+, percentual do orçamento consumido
}

export interface PulseResult {
  generatedAt: string; // ISO 8601, timestamp de quando foi gerado
  teamMembers: PulseTeamMember[];
  teamTodaySeconds: number; // total de horas de foco do time hoje
  teamFocusingCount: number; // quantos estão em 'Ativo' agora
  projectBudgets: PulseProjectBudget[];
  dailyGoalPct: number; // 0-100+, quantas horas acumuladas vs. meta diária (ex: 38/40h = 95%)
  insights: {
    unclassifiedSeconds: number; // segundos de task_logs sem client_id ou project_id
    topClientPct: number; // % que o cliente top consome da equipe esta semana
    longestBlockSeconds: number; // maior bloco de foco contínuo hoje
    todayVsYesterdayPct: number; // variação % de hoje vs ontem (ex: +18, -12, 0 se ontem foi 0)
    noFocusMemberIds: string[]; // IDs dos membros com 0 segundos hoje e offline
  };
}
