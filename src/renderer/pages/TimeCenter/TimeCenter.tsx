import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import allusWatermark from '../../assets/allus-focus-watermark.svg';
import { Titlebar } from '../../components/Titlebar';
import { DateFilterBar } from '../../components/DateFilterBar';
import { ToastHost } from '../../components/ToastHost';
import { invokeAction } from '../../invoke';
import { useAppState } from '../../useAppState';
import { formatDuration } from '../../../shared/types';
import type { DateRangeFilter, SessionDateFilter, TimeReportPerson } from '../../../shared/types';

export function TimeCenter() {
  const snapshot = useAppState();
  const [filter, setFilter] = useState<SessionDateFilter>('Hoje');
  const [people, setPeople] = useState<TimeReportPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const range: DateRangeFilter = { filter };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.allus.invoke('report:query', { range }).then((result) => {
      if (cancelled) return;
      setPeople(result.people);
      setTotal(result.totalSeconds);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.allus.invoke('window:closeSelf', undefined);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  function expandAll() {
    const ids = new Set<string>();
    for (const person of people) {
      ids.add(`p:${person.userId}`);
      for (const client of person.clients) {
        ids.add(`c:${client.id}`);
        for (const project of client.projects) {
          ids.add(`pr:${project.id}`);
          for (const task of project.tasks) ids.add(`t:${task.id}`);
        }
      }
    }
    setExpanded(ids);
  }

  async function handleExport() {
    await invokeAction('report:exportCsv', { range });
  }

  return (
    <div
      className="allus-app-bg allus-watermark"
      style={
        {
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          '--allus-watermark-image': `url(${allusWatermark})`,
        } as CSSProperties
      }
    >
      <Titlebar title="CENTRAL DE TEMPOS · Tempo acumulado por pessoa/tarefa" />
      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--allus-yellow)', fontFamily: 'var(--allus-font-mono)' }}>
            {formatDuration(total)}
          </div>
          <div style={{ flex: 1 }} />
          <button style={pillButtonStyle} onClick={expandAll}>Expandir tudo</button>
          <button style={pillButtonStyle} onClick={() => setExpanded(new Set())}>Recolher tudo</button>
          <button style={pillButtonStyle} onClick={handleExport} disabled={people.length === 0}>
            Exportar CSV
          </button>
        </div>

        <DateFilterBar value={filter} onChange={setFilter} />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 80px 100px',
            fontSize: 11,
            color: 'var(--allus-text-muted)',
            padding: '0 8px',
          }}
        >
          <span>PESSOA / CLIENTE / PROJETO / TAREFA</span>
          <span>SESSÕES</span>
          <span>TEMPO</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {loading && <div style={{ fontSize: 13, color: 'var(--allus-text-muted)' }}>Carregando...</div>}
          {!loading && people.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--allus-text-muted)' }}>Nenhuma tarefa registrada neste período.</div>
          )}
          {people.map((person) => (
            <div key={person.userId}>
              <ReportRow
                label={person.fullName}
                color="var(--allus-yellow-deep)"
                seconds={person.totalSeconds}
                expandable
                expanded={expanded.has(`p:${person.userId}`)}
                onToggle={() => toggle(`p:${person.userId}`)}
              />
              {expanded.has(`p:${person.userId}`) &&
                person.clients.map((client) => (
                  <div key={client.id} style={{ marginLeft: 16 }}>
                    <ReportRow
                      label={client.clientName}
                      color="var(--allus-white)"
                      seconds={client.totalSeconds}
                      expandable
                      expanded={expanded.has(`c:${client.id}`)}
                      onToggle={() => toggle(`c:${client.id}`)}
                    />
                    {expanded.has(`c:${client.id}`) &&
                      client.projects.map((project) => (
                        <div key={project.id} style={{ marginLeft: 16 }}>
                          <ReportRow
                            label={project.projectName}
                            color="var(--allus-yellow)"
                            seconds={project.totalSeconds}
                            expandable
                            expanded={expanded.has(`pr:${project.id}`)}
                            onToggle={() => toggle(`pr:${project.id}`)}
                          />
                          {expanded.has(`pr:${project.id}`) &&
                            project.tasks.map((task) => (
                              <div key={task.id} style={{ marginLeft: 16 }}>
                                <ReportRow
                                  label={task.title}
                                  seconds={task.totalSeconds}
                                  sessions={task.totalSessionCount}
                                  expandable={task.subtasks.length > 0}
                                  expanded={expanded.has(`t:${task.id}`)}
                                  onToggle={() => toggle(`t:${task.id}`)}
                                />
                                {expanded.has(`t:${task.id}`) && (
                                  <div style={{ marginLeft: 16 }}>
                                    {task.directSeconds > 0 && (
                                      <ReportRow label="Direto na tarefa" seconds={task.directSeconds} muted />
                                    )}
                                    {task.subtasks.map((sub) => (
                                      <ReportRow key={sub.id} label={sub.title} seconds={sub.totalSeconds} sessions={sub.sessionCount} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      ))}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
      <ToastHost />
    </div>
  );
}

function ReportRow({
  label,
  color,
  seconds,
  sessions,
  expandable,
  expanded,
  onToggle,
  muted,
}: {
  label: string;
  color?: string;
  seconds: number;
  sessions?: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  muted?: boolean;
}) {
  return (
    <div
      onClick={expandable ? onToggle : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 80px 100px',
        alignItems: 'center',
        padding: '6px 8px',
        borderRadius: 8,
        fontSize: 13,
        cursor: expandable ? 'pointer' : 'default',
        color: muted ? 'var(--allus-text-muted)' : undefined,
      }}
    >
      <span style={{ color }}>
        {expandable ? (expanded ? '▾ ' : '▸ ') : ''}
        {label}
      </span>
      <span style={{ fontSize: 12 }}>{sessions ?? ''}</span>
      <span style={{ fontFamily: 'var(--allus-font-mono)', fontSize: 12 }}>{formatDuration(seconds)}</span>
    </div>
  );
}

const pillButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid var(--allus-glass-border)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--allus-text-primary)',
  fontSize: 12,
  whiteSpace: 'nowrap',
};
