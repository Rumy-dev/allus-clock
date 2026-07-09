import { supabase } from '../supabase/client';
import { appStore } from './appStore';
import type { PulseResult, PulseTeamMember, PulseProjectBudget, PomoSession } from '../../shared/types';
import { mapSession } from './timerEngine';

function formatSeconds(total: number): number {
  return Math.round(total / 3600 * 100) / 100; // horas com 2 decimais
}

function startOfDay(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function endOfDay(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
}

function startOfMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function sevenDaysAgo(d: Date): string {
  const sevenAgo = new Date(d);
  sevenAgo.setDate(sevenAgo.getDate() - 6);
  return startOfDay(sevenAgo);
}

export async function queryPulse(): Promise<PulseResult> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);
  const weekStart = sevenDaysAgo(now);

  // Paraleliza as queries independentes: ativas, perfis, today, month para orçamento
  const [
    { data: activeSessions, error: sessionsError },
    { data: allProfiles, error: profilesError },
    { data: todayTaskLogs, error: todayLogsError },
    { data: monthTaskLogs, error: monthLogsError },
  ] = await Promise.all([
    supabase
      .from('sessions')
      .select('*, profiles(full_name)')
      .in('status', ['Ativo', 'Pausado'])
      .order('started_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name'),
    supabase
      .from('task_logs')
      .select('id, user_id, elapsed_seconds, task_id, project_id, client_id, task_title, session_id, started_at')
      .gte('started_at', todayStart)
      .lte('started_at', todayEnd),
    supabase
      .from('task_logs')
      .select('project_id, elapsed_seconds')
      .gte('started_at', monthStart)
      .lte('started_at', todayEnd),
  ]);

  if (sessionsError) {
    console.error('[pulseBuilder] erro ao carregar sessões ativas', sessionsError);
    throw new Error(sessionsError.message);
  }
  if (profilesError) throw new Error(profilesError.message);
  if (todayLogsError) throw new Error(todayLogsError.message);
  if (monthLogsError) throw new Error(monthLogsError.message);

  // Mapeia sessões por usuário
  const sessionMap = new Map<string, PomoSession>();
  if (activeSessions) {
    for (const s of activeSessions) {
      sessionMap.set(s.user_id, mapSession(s));
    }
  }

  // Busca clientes e projetos para lookup de nomes
  const snapshot = appStore.getSnapshot();
  const clientMap = new Map(snapshot.clients.map((c) => [c.id, c.name]));
  const projectMap = new Map(snapshot.projects.map((p) => [p.id, p.name]));
  const projectBudgetMap = new Map(snapshot.projects.map((p) => [p.id, p.budgetHours]));

  // === CONSTRÓI TEAM MEMBERS COM STATUS AO VIVO ===
  const teamMembers: PulseTeamMember[] = [];
  const todayLogsByUser = new Map<string, typeof todayTaskLogs>();
  for (const log of todayTaskLogs ?? []) {
    if (!todayLogsByUser.has(log.user_id)) {
      todayLogsByUser.set(log.user_id, []);
    }
    const userLogs = todayLogsByUser.get(log.user_id);
    if (userLogs) {
      userLogs.push(log);
    }
  }

  for (const profile of allProfiles ?? []) {
    const session = sessionMap.get(profile.id);
    const todayLogs = todayLogsByUser.get(profile.id) ?? [];
    const todaySeconds = todayLogs.reduce((sum, log) => sum + (log.elapsed_seconds ?? 0), 0);

    // Se tem sessão ativa, pega o active task log
    let currentTaskTitle: string | null = null;
    let clientName: string | null = null;
    let projectName: string | null = null;

    if (session?.activeTaskLogId) {
      const activeLog = todayLogs.find((l) => l.id === session.activeTaskLogId);
      if (activeLog) {
        currentTaskTitle = activeLog.task_title;
        clientName = activeLog.client_id ? clientMap.get(activeLog.client_id) ?? null : null;
        projectName = activeLog.project_id ? projectMap.get(activeLog.project_id) ?? null : null;
      }
    }

    // Encontra a sessão mais recente para lastActivityAt
    let lastActivityAt: string | null = null;
    if (todayLogs.length > 0) {
      const mostRecent = todayLogs.reduce((max, log) => (new Date(log.started_at) > new Date(max.started_at) ? log : max));
      lastActivityAt = mostRecent.started_at;
    } else if (session) {
      lastActivityAt = session.startedAt;
    }

    teamMembers.push({
      userId: profile.id,
      fullName: profile.full_name,
      status: session?.status ?? 'offline',
      currentTaskTitle,
      clientName,
      projectName,
      elapsedSeconds: session?.elapsedSeconds ?? 0,
      plannedSeconds: session?.plannedSeconds ?? 0,
      lastActivityAt,
      todayTotalSeconds: todaySeconds,
      syncedAt: session?.syncedAt,
    });
  }

  // === RADAR DE ORÇAMENTO ===
  const monthLogsByProject = new Map<string, number>();
  for (const log of monthTaskLogs ?? []) {
    if (log.project_id) {
      monthLogsByProject.set(log.project_id, (monthLogsByProject.get(log.project_id) ?? 0) + (log.elapsed_seconds ?? 0));
    }
  }

  const projectBudgets: PulseProjectBudget[] = [];
  for (const [projectId, budgetHours] of projectBudgetMap.entries()) {
    if (budgetHours !== null && budgetHours > 0) {
      const loggedSeconds = monthLogsByProject.get(projectId) ?? 0;
      const loggedHours = formatSeconds(loggedSeconds);
      const pct = Math.round((loggedHours / budgetHours) * 100);
      const projectName = projectMap.get(projectId) ?? projectId;
      projectBudgets.push({
        projectId,
        projectName,
        budgetHours,
        loggedHours,
        pct,
      });
    }
  }

  // === INSIGHTS via RPC ===
  const { data: totalsData, error: totalsError } = await supabase.rpc('pulse_team_totals');
  if (totalsError) {
    console.warn('[pulseBuilder] erro ao chamar RPC pulse_team_totals, usando fallback local', totalsError);
  }

  let teamTodaySeconds = 0;
  let unclassifiedSeconds = 0;
  let longestBlockSeconds = 0;
  let teamYesterdaySeconds = 0;
  let topClientPct = 0;

  if (totalsData) {
    teamTodaySeconds = totalsData.teamTodaySeconds ?? 0;
    unclassifiedSeconds = totalsData.unclassifiedSeconds ?? 0;
    longestBlockSeconds = totalsData.longestBlockSeconds ?? 0;
    teamYesterdaySeconds = totalsData.teamYesterdaySeconds ?? 0;
    topClientPct = totalsData.topClientPct ?? 0;
  } else {
    // Fallback se RPC falhar: cálculo local (mantém compatibilidade)
    teamTodaySeconds = todayTaskLogs?.reduce((sum, log) => sum + (log.elapsed_seconds ?? 0), 0) ?? 0;
    unclassifiedSeconds = todayTaskLogs
      ?.filter((log) => !log.client_id || !log.project_id)
      .reduce((sum, log) => sum + (log.elapsed_seconds ?? 0), 0) ?? 0;
  }

  const teamFocusingCount = activeSessions?.filter((s) => s.status === 'Ativo').length ?? 0;

  // Daily goal %: assume 8h/dia como meta padrão
  const DAILY_GOAL_SECONDS = 8 * 3600;
  const dailyGoalPct = Math.round((teamTodaySeconds / DAILY_GOAL_SECONDS) * 100);

  // Hoje vs. ontem
  const todayVsYesterdayPct = teamYesterdaySeconds > 0
    ? Math.round(((teamTodaySeconds - teamYesterdaySeconds) / teamYesterdaySeconds) * 100)
    : 0;

  // Quem não focou hoje (offline + 0 segundos hoje)
  const noFocusMemberIds = teamMembers
    .filter((m) => m.status === 'offline' && m.todayTotalSeconds === 0)
    .map((m) => m.userId);

  return {
    generatedAt: now.toISOString(),
    teamMembers,
    teamTodaySeconds,
    teamFocusingCount,
    projectBudgets,
    dailyGoalPct,
    insights: {
      unclassifiedSeconds,
      topClientPct,
      longestBlockSeconds,
      todayVsYesterdayPct,
      noFocusMemberIds,
    },
  };
}
