import { useMemo, useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import allusWatermark from '../../assets/allus-focus-watermark.svg';
import { useAppState } from '../../useAppState';
import { invokeAction } from '../../invoke';
import { Titlebar } from '../../components/Titlebar';
import { DateFilterBar } from '../../components/DateFilterBar';
import { BarChart } from '../../components/BarChart';
import { TrendChart } from '../../components/TrendChart';
import { ToastHost } from '../../components/ToastHost';
import type { DateRangeFilter, SessionDateFilter, TimeReportPerson } from '../../../shared/types';

type DrillLevel = 'clients' | 'projects' | 'tasks';

interface DrillState {
  level: DrillLevel;
  clientId?: string;
  projectId?: string;
}

export function Dashboard() {
  const snapshot = useAppState();
  const [sessionFilter, setSessionFilter] = useState<SessionDateFilter>('Mês');
  const range: DateRangeFilter = { filter: sessionFilter };
  const [drill, setDrill] = useState<DrillState>({ level: 'clients' });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [report, setReport] = useState<{ people: TimeReportPerson[] } | null>(null);
  const [trend, setTrend] = useState<{ date: string; totalSeconds: number }[]>([]);

  const loadReport = async () => {
    try {
      const result = await invokeAction('report:query', { range });
      if (result) setReport(result);
    } catch (err) {
      console.error('Erro ao carregar relatório', err);
    }
  };

  const loadTrend = async () => {
    try {
      const trendData = await invokeAction('dashboard:trend', {
        range,
        clientId: drill.clientId,
        projectId: drill.projectId,
        userId: selectedUserId ?? undefined,
      });
      if (trendData) setTrend(trendData);
    } catch (err) {
      console.error('Erro ao carregar tendência', err);
    }
  };

  // Carrega dados ao montar e quando período/drill muda
  useEffect(() => {
    loadReport();
    loadTrend();
  }, [sessionFilter, drill, selectedUserId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.allus.invoke('window:closeSelf', undefined);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filteredPeople = useMemo(() => {
    if (!report) return [];
    if (!selectedUserId) return report.people;
    return report.people.filter((p) => p.userId === selectedUserId);
  }, [report, selectedUserId]);

  const peopleNames = useMemo(() => {
    if (!report) return [];
    return report.people.map((p) => ({ id: p.userId, name: p.fullName }));
  }, [report]);

  // Dados para os gráficos
  const drillItems = useMemo(() => {
    if (!filteredPeople || filteredPeople.length === 0) return [];

    if (drill.level === 'clients') {
      const clientsMap = new Map<string, number>();
      for (const person of filteredPeople) {
        for (const client of person.clients) {
          clientsMap.set(client.id, (clientsMap.get(client.id) ?? 0) + client.totalSeconds);
        }
      }
      return Array.from(clientsMap.entries()).map(([id, seconds]) => ({
        id,
        label: filteredPeople[0]?.clients.find((c) => c.id === id)?.clientName ?? id,
        value: seconds,
      }));
    }

    if (drill.level === 'projects' && drill.clientId) {
      const projectsMap = new Map<string, number>();
      for (const person of filteredPeople) {
        const client = person.clients.find((c) => c.id === drill.clientId);
        if (client) {
          for (const project of client.projects) {
            projectsMap.set(project.id, (projectsMap.get(project.id) ?? 0) + project.totalSeconds);
          }
        }
      }
      return Array.from(projectsMap.entries()).map(([id, seconds]) => ({
        id,
        label: filteredPeople[0]?.clients.find((c) => c.id === drill.clientId)?.projects.find((p) => p.id === id)?.projectName ?? id,
        value: seconds,
      }));
    }

    if (drill.level === 'tasks' && drill.projectId) {
      const tasksMap = new Map<string, number>();
      for (const person of filteredPeople) {
        for (const client of person.clients) {
          const project = client.projects.find((p) => p.id === drill.projectId);
          if (project) {
            for (const task of project.tasks) {
              tasksMap.set(task.id, (tasksMap.get(task.id) ?? 0) + task.totalSeconds);
            }
          }
        }
      }
      return Array.from(tasksMap.entries()).map(([id, seconds]) => ({
        id,
        label: filteredPeople[0]?.clients.flatMap((c) => c.projects).find((p) => p.id === drill.projectId)?.tasks.find((t) => t.id === id)?.title ?? id,
        value: seconds,
      }));
    }

    return [];
  }, [filteredPeople, drill]);

  const totalHours = useMemo(() => {
    const seconds = drillItems.reduce((sum, item) => sum + item.value, 0);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }, [drillItems]);

  const topItem = drillItems.length > 0 ? drillItems[0] : null;

  // Dados transversais (por tipo e por pessoa)
  const typeData = useMemo(() => {
    if (!snapshot) return [];
    if (!filteredPeople) return [];
    const typeMap = new Map<string, number>();
    for (const person of filteredPeople) {
      for (const client of person.clients) {
        for (const project of client.projects) {
          const type = snapshot!.projects.find((p) => p.id === project.id)?.type || 'Sem tipo';
          typeMap.set(type, (typeMap.get(type) ?? 0) + project.totalSeconds);
        }
      }
    }
    return Array.from(typeMap.entries()).map(([label, seconds]) => ({
      id: label,
      label,
      value: seconds,
    }));
  }, [filteredPeople, snapshot]);

  const personData = useMemo(() => {
    if (!report || selectedUserId) return [];
    return report.people.map((p) => {
      const seconds = p.clients.reduce((sum, c) => sum + c.totalSeconds, 0);
      return { id: p.userId, label: p.fullName, value: seconds };
    });
  }, [report, selectedUserId]);

  // Calcula métrica de pessoa com mais horas
  const personWithMostHours = useMemo(() => {
    if (!report) return null;
    if (report.people.length === 0) return null;
    const sorted = [...report.people].sort((a, b) => {
      const aTotal = a.clients.reduce((sum, c) => sum + c.totalSeconds, 0);
      const bTotal = b.clients.reduce((sum, c) => sum + c.totalSeconds, 0);
      return bTotal - aTotal;
    });
    return sorted[0];
  }, [report]);

  const personWithMostHoursFormatted = useMemo(() => {
    if (!personWithMostHours) return '—';
    const seconds = personWithMostHours.clients.reduce((sum, c) => sum + c.totalSeconds, 0);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${personWithMostHours.fullName} (${h}h ${String(m).padStart(2, '0')}m)`;
  }, [personWithMostHours]);

  if (!snapshot) return <div className="allus-app-bg" style={{ height: '100%' }} />;

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
      <Titlebar title="PAINEL DO GESTOR" />
      <div style={{ padding: 16, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Resumo Executivo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div className="allus-glass" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 8 }}>TOTAL DE HORAS</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--allus-yellow)', fontFamily: 'var(--allus-font-mono)' }}>{totalHours}</div>
          </div>
          <div className="allus-glass" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 8 }}>PESSOA COM MAIS HORAS</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{personWithMostHoursFormatted}</div>
          </div>
          <div className="allus-glass" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 8 }}>PROJETO COM MAIS HORAS</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{topItem?.label ?? '—'}</div>
          </div>
        </div>

        {/* Controles de Filtro */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <DateFilterBar value={sessionFilter} onChange={setSessionFilter} />
          </div>
          <label style={{ fontSize: 12, color: 'var(--allus-text-muted)', whiteSpace: 'nowrap' }}>
            Pessoa:
            <select
              value={selectedUserId ?? ''}
              onChange={(e) => setSelectedUserId(e.target.value || null)}
              style={{
                marginLeft: 6,
                padding: 4,
                borderRadius: 6,
                border: '1px solid var(--allus-glass-border)',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--allus-text-primary)',
                fontSize: 12,
              }}
            >
              <option value="">Todas</option>
              {peopleNames.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Horas por Pessoa (principal) */}
        {!selectedUserId && (
          <div className="allus-glass" style={{ padding: 12 }}>
            <BarChart title="Horas por pessoa" items={personData} color="#ecdc01" />
          </div>
        )}

        {/* Grid de outros gráficos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="allus-glass" style={{ padding: 12 }}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--allus-text-muted)', flex: 1 }}>
                {drill.level === 'clients' ? 'Horas por cliente' : drill.level === 'projects' ? 'Horas por projeto' : 'Horas por tarefa'}
              </div>
              {drill.level !== 'clients' && (
                <button
                  onClick={() => {
                    if (drill.level === 'projects') {
                      setDrill({ level: 'clients' });
                    } else {
                      setDrill({ level: 'projects', clientId: drill.clientId });
                    }
                  }}
                  style={{ fontSize: 10, border: 'none', background: 'transparent', color: 'var(--allus-yellow)', cursor: 'pointer' }}
                >
                  ← Voltar
                </button>
              )}
            </div>
            <BarChart
              title=""
              items={drillItems}
              color="#fafafa"
              onItemClick={(item) => {
                if (drill.level === 'clients') {
                  setDrill({ level: 'projects', clientId: item.id });
                } else if (drill.level === 'projects') {
                  setDrill({ level: 'tasks', clientId: drill.clientId, projectId: item.id });
                }
              }}
            />
          </div>

          <div className="allus-glass" style={{ padding: 12 }}>
            <BarChart title="Horas por tipo de projeto" items={typeData} color="#b8ac00" />
          </div>
        </div>

        <div className="allus-glass" style={{ padding: 12 }}>
          <TrendChart title="Tendência diária" data={trend} color="#fafafa" />
        </div>
      </div>
      <ToastHost />
    </div>
  );
}
