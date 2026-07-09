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
  console.log('[pulseBuilder] iniciando queryPulse...');
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterdayStart = startOfDay(new Date(now.getTime() - 24 * 3600 * 1000));
  const yesterdayEnd = endOfDay(new Date(now.getTime() - 24 * 3600 * 1000));
  const monthStart = startOfMonth(now);
  const weekStart = sevenDaysAgo(now);
  console.log('[pulseBuilder] datas calculadas:', { todayStart, todayEnd, yesterdayStart, yesterdayEnd });

  // 1. Sessões ativas/pausadas (live status)
  const { data: activeSessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('*, profiles(full_name)')
    .in('status', ['Ativo', 'Pausado'])
    .order('started_at', { ascending: false });

  if (sessionsError) {
    console.error('[pulseBuilder] erro ao carregar sessões ativas', sessionsError);
    throw new Error(sessionsError.message);
  }

  // Mapeia sessões por usuário
  const sessionMap = new Map<string, PomoSession>();
  if (activeSessions) {
    for (const s of activeSessions) {
      sessionMap.set(s.user_id, mapSession(s));
    }
  }

  // 2. Todos os usuários (para incluir offline)
  const { data: allProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name');

  if (profilesError) throw new Error(profilesError.message);

  // 3. Task logs de hoje para total de horas por pessoa
  const { data: todayTaskLogs, error: todayLogsError } = await supabase
    .from('task_logs')
    .select('id, user_id, elapsed_seconds, task_id, project_id, client_id, task_title, session_id, started_at')
    .gte('started_at', todayStart)
    .lte('started_at', todayEnd);

  if (todayLogsError) throw new Error(todayLogsError.message);

  // 3b. Task logs de ontem para comparação
  const { data: yesterdayTaskLogs, error: yesterdayLogsError } = await supabase
    .from('task_logs')
    .select('elapsed_seconds')
    .gte('started_at', yesterdayStart)
    .lte('started_at', yesterdayEnd);

  if (yesterdayLogsError) throw new Error(yesterdayLogsError.message);

  // 4. Task logs do mês para radar de orçamento
  const { data: monthTaskLogs, error: monthLogsError } = await supabase
    .from('task_logs')
    .select('project_id, elapsed_seconds')
    .gte('started_at', monthStart)
    .lte('started_at', todayEnd);

  if (monthLogsError) throw new Error(monthLogsError.message);

  // 5. Task logs da semana para insights
  const { data: weekTaskLogs, error: weekLogsError } = await supabase
    .from('task_logs')
    .select('client_id, elapsed_seconds, session_id')
    .gte('started_at', weekStart)
    .lte('started_at', todayEnd);

  if (weekLogsError) throw new Error(weekLogsError.message);

  // 6. Busca clientes e projetos para lookup de nomes
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

  // === INSIGHTS ===
  const teamTodaySeconds = todayTaskLogs?.reduce((sum, log) => sum + (log.elapsed_seconds ?? 0), 0) ?? 0;
  const teamFocusingCount = activeSessions?.filter((s) => s.status === 'Ativo').length ?? 0;

  // Sem classificação (sem client_id ou project_id)
  const unclassifiedSeconds = todayTaskLogs
    ?.filter((log) => !log.client_id || !log.project_id)
    .reduce((sum, log) => sum + (log.elapsed_seconds ?? 0), 0) ?? 0;

  // Cliente com maior consumo da semana
  const weekClientMap = new Map<string, number>();
  for (const log of weekTaskLogs ?? []) {
    if (log.client_id) {
      weekClientMap.set(log.client_id, (weekClientMap.get(log.client_id) ?? 0) + (log.elapsed_seconds ?? 0));
    }
  }
  const topClientSeconds = Math.max(...Array.from(weekClientMap.values()), 0) || 0;
  const weekTotal = weekTaskLogs?.reduce((sum, log) => sum + (log.elapsed_seconds ?? 0), 0) ?? 0;
  const topClientPct = weekTotal > 0 ? Math.round((topClientSeconds / weekTotal) * 100) : 0;

  // Maior bloco de foco contínuo hoje
  const { data: sessionsToday, error: sessionsTodayError } = await supabase
    .from('sessions')
    .select('elapsed_seconds')
    .eq('cycle_kind', 'Foco')
    .gte('started_at', todayStart)
    .lte('started_at', todayEnd);

  if (sessionsTodayError) throw new Error(sessionsTodayError.message);

  const longestBlockSeconds = Math.max(...(sessionsToday?.map((s) => s.elapsed_seconds ?? 0) ?? [0]), 0);

  // Daily goal %: assume 8h/dia como meta padrão
  const DAILY_GOAL_SECONDS = 8 * 3600;
  const dailyGoalPct = Math.round((teamTodaySeconds / DAILY_GOAL_SECONDS) * 100);

  // Hoje vs. ontem
  const teamYesterdaySeconds = yesterdayTaskLogs?.reduce((sum, log) => sum + (log.elapsed_seconds ?? 0), 0) ?? 0;
  const todayVsYesterdayPct = teamYesterdaySeconds > 0
    ? Math.round(((teamTodaySeconds - teamYesterdaySeconds) / teamYesterdaySeconds) * 100)
    : 0;

  // Quem não focou hoje (offline + 0 segundos hoje)
  const noFocusMemberIds = teamMembers
    .filter((m) => m.status === 'offline' && m.todayTotalSeconds === 0)
    .map((m) => m.userId);

  console.log('[pulseBuilder] calculados:', { teamTodaySeconds, teamFocusingCount, todayVsYesterdayPct, noFocusMemberIds });

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
