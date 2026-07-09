import { dialog } from 'electron';
import fs from 'node:fs';
import { supabase } from '../supabase/client';
import type {
  DateRangeFilter,
  PomoSession,
  TimeReportPerson,
} from '../../shared/types';
import { AVULSO_CLIENT_NAME } from '../../shared/types';
import type { TimeReportResult } from '../../shared/ipc-contract';
import { mapSession } from './timerEngine';

function rangeToBounds(range: DateRangeFilter): { start: string | null; end: string | null } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();

  switch (range.filter) {
    case 'Todas':
      return { start: null, end: null };
    case 'Hoje':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'Ontem': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'Mês': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: first.toISOString(), end: endOfDay(now) };
    }
    case '7 dias': {
      const sevenAgo = new Date(now);
      sevenAgo.setDate(sevenAgo.getDate() - 6);
      return { start: startOfDay(sevenAgo), end: endOfDay(now) };
    }
    case 'Intervalo':
      return { start: range.start ?? null, end: range.end ?? null };
  }
}

export async function queryReport(range: DateRangeFilter): Promise<TimeReportResult> {
  const { start, end } = rangeToBounds(range);
  let query = supabase
    .from('task_logs')
    .select('*, profiles(full_name), clients(name), projects(name), tasks(title, parent_task_id)');
  if (start) query = query.gte('started_at', start);
  if (end) query = query.lte('started_at', end);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const peopleMap = new Map<string, TimeReportPerson>();
  let totalSeconds = 0;

  for (const row of data ?? []) {
    const seconds: number = row.elapsed_seconds ?? 0;
    if (seconds <= 0) continue;
    totalSeconds += seconds;

    const userId: string = row.user_id;
    const fullName: string = row.profiles?.full_name ?? 'Desconhecido';
    const clientId: string = row.client_id ?? 'sem-cliente';
    const clientName: string = row.clients?.name ?? AVULSO_CLIENT_NAME;
    const projectId: string = row.project_id ?? 'sem-projeto';
    const projectName: string = row.projects?.name ?? AVULSO_CLIENT_NAME;
    const isSubtask = !!row.tasks?.parent_task_id;
    const parentTaskId: string | null = row.tasks?.parent_task_id ?? null;
    const taskId: string = isSubtask ? parentTaskId! : (row.task_id ?? 'sem-tarefa');
    const taskTitle: string = isSubtask
      ? (row.task_title?.split(' / ')[0] ?? 'Tarefa')
      : (row.tasks?.title ?? row.task_title ?? 'Tarefa avulsa');

    let person = peopleMap.get(userId);
    if (!person) {
      person = { userId, fullName, clients: [], totalSeconds: 0 };
      peopleMap.set(userId, person);
    }
    person.totalSeconds += seconds;

    let client = person.clients.find((c) => c.id === clientId);
    if (!client) {
      client = { id: clientId, clientName, projects: [], totalSeconds: 0 };
      person.clients.push(client);
    }
    client.totalSeconds += seconds;

    let project = client.projects.find((p) => p.id === projectId);
    if (!project) {
      project = { id: projectId, projectName, tasks: [], totalSeconds: 0 };
      client.projects.push(project);
    }
    project.totalSeconds += seconds;

    let task = project.tasks.find((t) => t.id === taskId);
    if (!task) {
      task = { id: taskId, title: taskTitle, directSeconds: 0, subtasks: [], totalSeconds: 0, totalSessionCount: 0 };
      project.tasks.push(task);
    }
    task.totalSeconds += seconds;
    task.totalSessionCount += 1;

    if (isSubtask) {
      const subTitle = row.tasks?.title ?? row.task_title;
      let sub = task.subtasks.find((s) => s.title === subTitle);
      if (!sub) {
        sub = { id: row.task_id ?? subTitle, title: subTitle, totalSeconds: 0, sessionCount: 0 };
        task.subtasks.push(sub);
      }
      sub.totalSeconds += seconds;
      sub.sessionCount += 1;
    } else {
      task.directSeconds += seconds;
    }
  }

  return { people: Array.from(peopleMap.values()), totalSeconds };
}

export async function querySessions(range: DateRangeFilter): Promise<PomoSession[]> {
  const { start, end } = rangeToBounds(range);
  let query = supabase.from('sessions').select('*').order('started_at', { ascending: false });
  if (start) query = query.gte('started_at', start);
  if (end) query = query.lte('started_at', end);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSession);
}

export async function queryTrend(
  range: DateRangeFilter,
  filters?: { clientId?: string; projectId?: string; userId?: string },
): Promise<{ date: string; totalSeconds: number }[]> {
  const { start, end } = rangeToBounds(range);

  // Chama RPC que agrupa por dia no Postgres
  const { data, error } = await supabase.rpc('report_trend', {
    p_start_date: start,
    p_end_date: end,
    p_client_id: filters?.clientId ?? null,
    p_project_id: filters?.projectId ?? null,
    p_user_id: filters?.userId ?? null,
  });

  if (error) {
    console.warn('[reportBuilder] erro ao chamar RPC report_trend, usando fallback local', error);

    // Fallback se RPC falhar: cálculo local (mantém compatibilidade)
    let query = supabase.from('task_logs').select('started_at, elapsed_seconds');
    if (start) query = query.gte('started_at', start);
    if (end) query = query.lte('started_at', end);
    if (filters?.clientId) query = query.eq('client_id', filters.clientId);
    if (filters?.projectId) query = query.eq('project_id', filters.projectId);
    if (filters?.userId) query = query.eq('user_id', filters.userId);

    const { data: fallbackData, error: fallbackError } = await query;
    if (fallbackError) throw new Error(fallbackError.message);

    const dayMap = new Map<string, number>();
    for (const row of fallbackData ?? []) {
      if ((row.elapsed_seconds ?? 0) <= 0) continue;
      const date = new Date(row.started_at).toISOString().split('T')[0];
      dayMap.set(date, (dayMap.get(date) ?? 0) + row.elapsed_seconds);
    }

    return Array.from(dayMap.entries())
      .map(([date, totalSeconds]) => ({ date, totalSeconds }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // RPC retorna array de {date, total_seconds}
  return (data ?? []).map((row: any) => ({
    date: row.date,
    totalSeconds: row.total_seconds ?? 0,
  }));
}

export async function exportCsv(range: DateRangeFilter): Promise<{ path: string } | { error: string }> {
  const report = await queryReport(range);
  const lines = ['Cliente,Projeto,Tarefa,Subtarefa,Sessões,Tempo (s),Tempo Formatado'];

  for (const person of report.people) {
    for (const client of person.clients) {
      for (const project of client.projects) {
        for (const task of project.tasks) {
          if (task.subtasks.length === 0) {
            lines.push(csvRow(client.clientName, project.projectName, task.title, '', task.totalSessionCount, task.totalSeconds));
          } else {
            if (task.directSeconds > 0) {
              lines.push(csvRow(client.clientName, project.projectName, task.title, '(direto)', 0, task.directSeconds));
            }
            for (const sub of task.subtasks) {
              lines.push(csvRow(client.clientName, project.projectName, task.title, sub.title, sub.sessionCount, sub.totalSeconds));
            }
          }
        }
      }
    }
  }

  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: 'allus-clock-relatorio.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return { error: 'Exportação cancelada.' };
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return { path: filePath };
}

function csvRow(client: string, project: string, task: string, subtask: string, sessions: number, seconds: number): string {
  const formatted = formatSeconds(seconds);
  return [client, project, task, subtask, String(sessions), String(seconds), formatted]
    .map((v) => `"${v.replace(/"/g, '""')}"`)
    .join(',');
}

function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
