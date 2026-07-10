import { useEffect, useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import allusWatermark from '../../assets/allus-focus-watermark.svg';
import { useAppState } from '../../useAppState';
import { Titlebar } from '../../components/Titlebar';
import { ToastHost } from '../../components/ToastHost';
import type { PulseResult, PulseTeamMember } from '../../../shared/types';
import { formatDuration } from '../../../shared/types';

export function Pulse() {
  const snapshot = useAppState();
  const [pulse, setPulse] = useState<PulseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPulse = async () => {
    try {
      setError(null);
      const result = await window.allus.invoke('pulse:query', undefined);
      setPulse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('[Pulse] erro ao carregar dados', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadPulse();
    setRefreshing(false);
  };

  useEffect(() => {
    loadPulse();
    let interval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(loadPulse, 18000);
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        loadPulse();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (!snapshot) return <div className="allus-app-bg" style={{ height: '100%' }} />;

  if (error) {
    return (
      <div className="allus-app-bg" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Titlebar title="ALLUS PULSE" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--allus-status-interrompido)', fontSize: 14 }}>
          {error}
        </div>
      </div>
    );
  }

  if (loading || !pulse) {
    return (
      <div className="allus-app-bg" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Titlebar title="ALLUS PULSE" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--allus-text-muted)', fontSize: 12 }}>
          Carregando... (loading={loading}, pulse={pulse ? 'ok' : 'null'})
        </div>
      </div>
    );
  }

  // Formata data por extenso
  const now = new Date(pulse.generatedAt);
  const daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const day = daysOfWeek[now.getDay()];
  const date = now.toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).toLowerCase();
  const headerDate = `${day.split('-')[0].split(' ')[0]} · ${date}`;

  const todayHours = formatDuration(pulse.teamTodaySeconds);
  const unclassifiedHours = formatDuration(pulse.insights.unclassifiedSeconds);
  const longestBlockHours = formatDuration(pulse.insights.longestBlockSeconds);
  const yesterdayTrend = pulse.insights.todayVsYesterdayPct;
  const yesterdayIndicator = yesterdayTrend > 0 ? '↑' : yesterdayTrend < 0 ? '↓' : '→';
  const yesterdayColor = yesterdayTrend > 0 ? 'var(--allus-status-concluido)' : yesterdayTrend < 0 ? 'var(--allus-status-interrompido)' : '#999';
  const noFocusMemberIds = pulse.insights.noFocusMemberIds;
  const glassAlpha = (snapshot.windowGlassOpacity ?? 70) / 100;

  return (
    <div
      className="allus-app-bg allus-watermark"
      style={
        {
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          '--allus-watermark-image': `url(${allusWatermark})`,
          '--allus-app-bg-color': `rgba(0, 0, 1, ${glassAlpha})`,
          '--allus-glass-bg-dynamic': `rgba(255, 255, 255, ${0.06 * glassAlpha})`,
          '--allus-glass-border-dynamic': `rgba(255, 255, 255, ${0.14 * glassAlpha})`,
        } as CSSProperties
      }
    >
      <Titlebar title={`ALLUS PULSE · ${headerDate}`} />
      <div style={{ padding: 16, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Botão de atualizar manual */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--allus-glass-border)',
              color: 'var(--allus-text-muted)',
              fontSize: 11,
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
              }}
            >
              ↻
            </span>
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>

        {/* Resumo Executivo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div className="allus-glass" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 8 }}>FOCANDO AGORA</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--allus-yellow)', fontFamily: 'var(--allus-font-mono)' }}>
              {pulse.teamFocusingCount}
            </div>
          </div>
          <div className="allus-glass" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              HOJE (HORAS)
              <span style={{ fontSize: 14, color: yesterdayColor, fontWeight: 'bold' }}>{yesterdayIndicator}</span>
              <span style={{ fontSize: 9, color: yesterdayColor }}>{Math.abs(yesterdayTrend)}%</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--allus-white)', fontFamily: 'var(--allus-font-mono)' }}>{todayHours}</div>
          </div>
          <div className="allus-glass" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 8 }}>META DIÁRIA</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: pulse.dailyGoalPct >= 100 ? 'var(--allus-status-concluido)' : 'var(--allus-yellow)', fontFamily: 'var(--allus-font-mono)' }}>
              {pulse.dailyGoalPct}%
            </div>
          </div>
        </div>

        {/* EQUIPE AO VIVO */}
        <div className="allus-glass" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--allus-text-muted)', marginBottom: 12 }}>
            EQUIPE AO VIVO ({pulse.teamMembers.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pulse.teamMembers.map((member) => (
              <TeamMemberRow key={member.userId} member={member} />
            ))}
          </div>
        </div>

        {/* Grid de Radar + Insights */}
        {(pulse.projectBudgets.length > 0 || pulse.insights.unclassifiedSeconds > 0 || noFocusMemberIds.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* RADAR DE ORÇAMENTO */}
            {pulse.projectBudgets.length > 0 && (
              <div className="allus-glass" style={{ padding: 16, cursor: 'pointer' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--allus-text-muted)', marginBottom: 12 }}>RADAR DE PROJETOS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pulse.projectBudgets.slice(0, 3).map((proj) => (
                    <div
                      key={proj.projectId}
                      onClick={() => {
                        try {
                          window.allus.invoke('window:openDashboard', undefined);
                        } catch (err) {
                          console.error('Erro ao abrir Dashboard:', err);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: 6,
                        borderRadius: 4,
                        transition: 'background 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--allus-text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {proj.projectName}
                          </span>
                          {proj.pct > 100 && <span style={{ color: 'var(--allus-status-interrompido)', fontSize: 12, fontWeight: 'bold' }}>⚠</span>}
                        </div>
                        <div
                          style={{
                            width: '100%',
                            height: 6,
                            background: 'rgba(255,255,255,0.08)',
                            borderRadius: 3,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(proj.pct, 100)}%`,
                              height: '100%',
                              background: proj.pct <= 100 ? 'var(--allus-yellow)' : 'var(--allus-status-interrompido)',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--allus-text-muted)', fontFamily: 'var(--allus-font-mono)', minWidth: 40, textAlign: 'right' }}>
                        {proj.pct}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* INSIGHTS */}
            <div className="allus-glass" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--allus-text-muted)', marginBottom: 12 }}>INSIGHTS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 }}>
                <div style={{ paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ color: 'var(--allus-text-muted)', marginBottom: 4 }}>↑ Top cliente</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--allus-yellow)' }}>{pulse.insights.topClientPct}%</div>
                </div>
                {pulse.insights.unclassifiedSeconds > 0 && (
                  <div style={{ paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ color: 'var(--allus-text-muted)', marginBottom: 4 }}>⚠ Sem classificação</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--allus-status-pausado)' }}>{unclassifiedHours}</div>
                  </div>
                )}
                {noFocusMemberIds.length > 0 && (
                  <div style={{ paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ color: 'var(--allus-text-muted)', marginBottom: 4 }}>
                      ○ Sem bloco ({noFocusMemberIds.length})
                    </div>
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {pulse.teamMembers
                        .filter((m) => noFocusMemberIds.includes(m.userId))
                        .slice(0, 3)
                        .map((m) => m.fullName)
                        .join(', ')}
                      {noFocusMemberIds.length > 3 && ` +${noFocusMemberIds.length - 3}`}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ color: 'var(--allus-text-muted)', marginBottom: 4 }}>★ Maior foco</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--allus-yellow)' }}>{longestBlockHours}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <ToastHost />
    </div>
  );
}

interface TeamMemberRowProps {
  member: PulseTeamMember;
}

function TeamMemberRow({ member }: TeamMemberRowProps) {
  const [highlighted, setHighlighted] = useState(false);
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(member.elapsedSeconds);
  const prevStatusRef = useRef(member.status);

  // Recalcula o tempo ao vivo a cada segundo quando status === 'Ativo'
  useEffect(() => {
    // Se passou para Ativo, reseta o base elapsed e syncedAt
    if (member.status === 'Ativo') {
      const syncedAtMs = member.syncedAt ? new Date(member.syncedAt).getTime() : Date.now();
      const nowMs = Date.now();
      const elapsedSinceSyncMs = Math.max(0, nowMs - syncedAtMs);
      const baseLiveElapsed = member.elapsedSeconds + Math.floor(elapsedSinceSyncMs / 1000);
      setLiveElapsedSeconds(baseLiveElapsed);

      const interval = setInterval(() => {
        setLiveElapsedSeconds((prev) => prev + 1);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      // Se pausado/offline, usa o elapsed do servidor como congelado
      setLiveElapsedSeconds(member.elapsedSeconds);
    }
  }, [member.status, member.elapsedSeconds, member.syncedAt]);

  useEffect(() => {
    if (prevStatusRef.current !== 'offline' && member.status === 'Concluído') {
      setHighlighted(true);
      const timer = setTimeout(() => setHighlighted(false), 1500);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = member.status;
  }, [member.status]);

  const statusDot = member.status === 'Ativo' ? '●' : member.status === 'Pausado' ? '◐' : '○';
  const statusColor = member.status === 'Ativo' ? 'var(--allus-status-ativo)' : member.status === 'Pausado' ? 'var(--allus-status-pausado)' : '#555';

  let displayTime: string;
  if (member.status !== 'offline') {
    displayTime = `${formatDuration(liveElapsedSeconds)} / ${formatDuration(member.plannedSeconds)}`;
  } else {
    displayTime = '—';
  }

  const taskDisplay = member.currentTaskTitle
    ? `${member.clientName ? member.clientName + ' · ' : ''}${member.currentTaskTitle}`
    : '—';

  return (
    <div
      style={{
        padding: 10,
        borderRadius: 8,
        background: highlighted ? 'rgba(236, 220, 1, 0.15)' : 'rgba(255,255,255,0.04)',
        border: highlighted ? '1px solid rgba(236, 220, 1, 0.3)' : '1px solid rgba(255,255,255,0.08)',
        transition: highlighted ? 'all 0.15s ease' : 'all 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 11,
        animation: highlighted ? 'pulse 1.5s ease-out' : 'none',
      }}
    >
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 0.8; }
        }
      `}</style>
      <span style={{ color: statusColor, fontSize: 14, fontWeight: 'bold' }}>{statusDot}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, color: 'var(--allus-text-primary)', marginBottom: 2 }}>{member.fullName}</div>
        <div style={{ color: 'var(--allus-text-muted)', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {taskDisplay}
        </div>
      </div>
      <div style={{ color: 'var(--allus-text-muted)', fontFamily: 'var(--allus-font-mono)', fontSize: 10, whiteSpace: 'nowrap', textAlign: 'right' }}>
        {displayTime}
      </div>
    </div>
  );
}
