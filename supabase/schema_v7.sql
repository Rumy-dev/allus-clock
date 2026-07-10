-- Allus Clock — incremento v7
-- RPCs para agregação no Postgres (Pulse e relatórios).
-- Rode no SQL Editor do Supabase (uma vez), depois do schema_v6.sql.

-- 1. RPC para agregados do Pulse: totais de hoje/ontem/semana, clientes top, bloco mais longo
create or replace function public.pulse_team_totals()
returns json
language sql
stable
as $$
  with today_bounds as (
    select
      date_trunc('day', now() at time zone 'UTC')::timestamptz as today_start,
      (date_trunc('day', now() at time zone 'UTC') + interval '1 day')::timestamptz as today_end
  ),
  yesterday_bounds as (
    select
      (date_trunc('day', now() at time zone 'UTC') - interval '1 day')::timestamptz as yesterday_start,
      date_trunc('day', now() at time zone 'UTC')::timestamptz as yesterday_end
  ),
  week_start as (
    select (date_trunc('week', now() at time zone 'UTC'))::timestamptz as week_begin
  ),
  today_logs as (
    select coalesce(sum(elapsed_seconds), 0)::bigint as total
    from public.task_logs
    where started_at >= (select today_start from today_bounds)
      and started_at < (select today_end from today_bounds)
  ),
  today_unclassified as (
    select coalesce(sum(elapsed_seconds), 0)::bigint as total
    from public.task_logs
    where started_at >= (select today_start from today_bounds)
      and started_at < (select today_end from today_bounds)
      and client_id is null
  ),
  yesterday_logs as (
    select coalesce(sum(elapsed_seconds), 0)::bigint as total
    from public.task_logs
    where started_at >= (select yesterday_start from yesterday_bounds)
      and started_at < (select yesterday_end from yesterday_bounds)
  ),
  week_logs as (
    select coalesce(sum(elapsed_seconds), 0)::bigint as total
    from public.task_logs
    where started_at >= (select week_begin from week_start)
  ),
  top_client as (
    select client_id, coalesce(sum(elapsed_seconds), 0)::bigint as total_seconds
    from public.task_logs
    where started_at >= (select today_start from today_bounds)
      and started_at < (select today_end from today_bounds)
      and client_id is not null
    group by client_id
    order by total_seconds desc
    limit 1
  ),
  longest_today_focus as (
    select coalesce(max(elapsed_seconds), 0)::integer as max_seconds
    from public.sessions
    where cycle_kind = 'Foco'
      and started_at >= (select today_start from today_bounds)
      and started_at < (select today_end from today_bounds)
  )
  select json_build_object(
    'teamTodaySeconds', (select total from today_logs),
    'unclassifiedSeconds', (select total from today_unclassified),
    'teamYesterdaySeconds', (select total from yesterday_logs),
    'weekTotalSeconds', (select total from week_logs),
    'topClientId', (select client_id from top_client),
    'topClientSeconds', (select total_seconds from top_client),
    'longestBlockSeconds', (select max_seconds from longest_today_focus)
  );
$$;

grant execute on function public.pulse_team_totals() to authenticated;

-- 2. RPC para agregação de trend (relatório): por dia, opcionalmente filtrado por cliente/projeto/usuário
create or replace function public.report_trend(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_client_id uuid default null,
  p_project_id uuid default null,
  p_user_id uuid default null
)
returns table(date date, total_seconds bigint)
language sql
stable
as $$
  select
    (date_trunc('day', tl.started_at))::date as date,
    coalesce(sum(tl.elapsed_seconds), 0)::bigint as total_seconds
  from public.task_logs tl
  where tl.started_at >= p_start_date
    and tl.started_at < p_end_date
    and (p_client_id is null or tl.client_id = p_client_id)
    and (p_project_id is null or tl.project_id = p_project_id)
    and (p_user_id is null or tl.user_id = p_user_id)
  group by (date_trunc('day', tl.started_at))::date
  order by date asc;
$$;

grant execute on function public.report_trend(timestamptz, timestamptz, uuid, uuid, uuid) to authenticated;

-- 3. RPC para "tarefas mais usadas" sem transferir toda a tabela task_logs
create or replace function public.most_used_tasks(p_user_id uuid, p_limit integer default 3)
returns table(
  task_id uuid,
  project_id uuid,
  client_id uuid,
  task_title text,
  elapsed_seconds bigint,
  started_at timestamptz,
  task_count bigint
)
language sql
stable
as $$
  with ranked as (
    select
      tl.*,
      count(*) over (partition by tl.task_id) as task_count,
      row_number() over (
        partition by tl.task_id
        order by tl.started_at desc, tl.id desc
      ) as rn
    from public.task_logs tl
    where tl.user_id = p_user_id
      and tl.task_id is not null
  )
  select
    task_id,
    project_id,
    client_id,
    task_title,
    elapsed_seconds,
    started_at,
    task_count
  from ranked
  where rn = 1
  order by task_count desc, started_at desc
  limit greatest(coalesce(p_limit, 3), 0);
$$;

grant execute on function public.most_used_tasks(uuid, integer) to authenticated;
