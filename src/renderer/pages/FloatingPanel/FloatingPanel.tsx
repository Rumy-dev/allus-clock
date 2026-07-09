import { useState, useEffect, useRef } from 'react';
import { useAppState } from '../../useAppState';
import { formatDuration } from '../../../shared/types';
import { useKeyboardShortcuts } from '../../useKeyboardShortcuts';
import { invokeAction } from '../../invoke';
import { ToastHost } from '../../components/ToastHost';
import { TaskModeSelector } from '../../components/TaskModeSelector';
import { ProjectPicker } from '../../components/ProjectPicker';
import { displayPath } from '../../../shared/types';

export function FloatingPanel() {
  const snapshot = useAppState();
  const [showAdd, setShowAdd] = useState(false);
  const [text, setText] = useState('');
  const [modeSelectTask, setModeSelectTask] = useState<{ taskId: string | null; title: string } | null>(null);
  const [showOpacityControl, setShowOpacityControl] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [myHoursSeconds, setMyHoursSeconds] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const modalCardRef = useRef<HTMLDivElement>(null);
  const opacityPanelRef = useRef<HTMLDivElement>(null);
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);

  const panelOpacity = (snapshot?.floatingPanelOpacity ?? 90) / 100;

  useKeyboardShortcuts({
    onPlayPause: () => invokeAction('timer:playPause', undefined),
    onEscape: () => {
      setShowAdd(false);
      setModeSelectTask(null);
    },
  });

  const session = snapshot?.activeSession ?? null;
  const activeLog = session ? snapshot?.activeTaskLogs.find((l) => l.id === session.activeTaskLogId) ?? null : null;

  // Auto-fit apenas quando há modal/overlay aberto. Caso contrário, respeita
  // o tamanho que o usuário pode ter definido manualmente.
  useEffect(() => {
    const PADDING_X = 2 * 12; // var(--allus-space-3) nas duas bordas
    const PADDING_Y = 2 * 16; // var(--allus-space-4) nas duas bordas
    const BORDER_LEFT = 3;
    const BUTTON_SPACE = 60;

    const measure = () => {
      // Quando há modal/overlay, força o tamanho para o modal
      if (modeSelectTask) {
        const el = modalCardRef.current;
        if (!el) return;
        const width = el.offsetWidth + 48;
        const height = Math.min(el.offsetHeight + 48, window.screen.availHeight * 0.85);
        applySize(width, height);
        return;
      }

      if (showProjectPicker) {
        const el = projectPickerRef.current;
        if (!el) return;
        const width = el.offsetWidth + 48;
        const height = Math.min(el.offsetHeight + 48, window.screen.availHeight * 0.85);
        applySize(width, height);
        return;
      }

      // Sem modal: não força redimensionamento automático
      // O usuário pode ter redimensionado manualmente (floatingPanelSize !== null)
      // e queremos respeitar essa preferência
    };

    function applySize(width: number, height: number) {
      const next = { width: Math.round(width), height: Math.round(height) };
      const last = lastSizeRef.current;
      if (last && last.width === next.width && last.height === next.height) return;
      lastSizeRef.current = next;
      invokeAction('window:setFloatingHeight', next);
    }

    const observed = [modalCardRef.current, projectPickerRef.current].filter(
      (el): el is HTMLDivElement => el !== null,
    );
    if (observed.length === 0) {
      measure();
      return;
    }
    const observer = new ResizeObserver(measure);
    observed.forEach((el) => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [modeSelectTask, showProjectPicker]);

  useEffect(() => {
    if (!snapshot?.auth.profile) return;
    let cancelled = false;
    invokeAction('report:query', { range: { filter: '7 dias' } }).then((result) => {
      if (cancelled || !result) return;
      const me = result.people.find((p) => p.userId === snapshot.auth.profile!.id);
      const seconds = me ? me.clients.reduce((sum, c) => sum + c.totalSeconds, 0) : 0;
      setMyHoursSeconds(seconds);
    });
    return () => {
      cancelled = true;
    };
  }, [snapshot?.auth.profile?.id]);

  if (!snapshot) return <div className="allus-app-bg" style={{ height: '100%' }} />;

  const lastTask = snapshot.recentTasks[0]
    ? { taskId: snapshot.recentTasks[0].taskId, title: snapshot.recentTasks[0].taskTitle }
    : null;

  const destinoProject = snapshot.projects.find((p) => p.id === snapshot.selectedProjectId);
  const destinoClient = destinoProject ? snapshot.clients.find((c) => c.id === destinoProject.clientId) : null;
  const destinoLabel = destinoProject ? displayPath([destinoClient?.name, destinoProject.name]) : 'Avulsa';

  const remaining = session ? Math.max(0, session.plannedSeconds - session.elapsedSeconds) : 0;
  const elapsed = session ? session.elapsedSeconds : 0;
  const progress = session ? elapsed / Math.max(1, session.plannedSeconds) : 0;
  const isAlertTime = remaining <= 300 && remaining > 0 && session?.status === 'Ativo';

  // Histórico do dia
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = snapshot.recentSessions.filter(
    (s) => s.startedAt?.startsWith(today) && s.cycleKind === 'Foco' && s.status === 'Concluído',
  );
  const totalFocusSecondsToday = todaySessions.reduce((sum, s) => sum + s.elapsedSeconds, 0);
  const cyclesCompletedToday = todaySessions.length;
  const focusHours = Math.floor(totalFocusSecondsToday / 3600);
  const focusMinutes = Math.floor((totalFocusSecondsToday % 3600) / 60);

  let label = session?.cycleKind === 'Pausa' ? 'Pausa ⏸' : 'Nenhuma tarefa em foco';
  if (activeLog) {
    const project = snapshot.projects.find((p) => p.id === activeLog.projectId);
    const client = project ? snapshot.clients.find((c) => c.id === project.clientId) : null;
    const breadcrumb = [client?.name, project?.name, activeLog.taskTitle].filter(Boolean).join(' › ');
    label = breadcrumb || activeLog.taskTitle;
  }

  const skipLabel = session?.cycleKind === 'Pausa' ? '⏭ foco' : '⏭ pausa';
  const isFocus = session?.cycleKind === 'Foco';
  const cycleColor = isFocus ? '#ff5fae' : '#4bf5e3';
  const cycleEmoji = isFocus ? '🔴' : '🟢';
  const alertColor = isAlertTime ? '#ff5fae' : 'var(--allus-text-primary)';

  // Status badge — usa a mesma bolinha de status do resto do app (allus-status-dot)
  const statusDotStatus: 'Ativo' | 'Pausado' | 'Concluído' | 'Interrompido' = session?.status ?? 'Interrompido';
  const statusLabel = !session ? 'Parado' : session.status === 'Interrompido' ? 'Parado' : session.status;

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await invokeAction('task:quickAdd', { title: text.trim(), avulsa: false });
    setText('');
    setShowAdd(false);
  }

  // Opacidades padronizadas em função da preferência do usuário
  const bgOpacity = panelOpacity * 0.85;
  const borderOpacity = panelOpacity * 0.5;
  const textMutedOpacity = panelOpacity * 0.6;

  return (
    <div
      className="allus-titlebar allus-floating-root"
      style={{
        height: '100%',
        padding: 'var(--allus-space-4) var(--allus-space-3)',
        borderLeft: `3px solid ${session ? cycleColor : `rgba(255,255,255,${borderOpacity * 0.3})`}`,
        overflowY: 'auto',
        background: `rgba(13, 11, 22, ${bgOpacity})`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
      } as any}
    >
      <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-4)', flex: 1, overflowY: 'auto' }}>
      {/* Seção superior: Status, Ciclo, Timer, Progresso */}
      <div
        className="allus-no-drag"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--allus-space-3)',
          paddingBottom: 'var(--allus-space-3)',
          borderBottom: `1px solid rgba(255,255,255,${borderOpacity * 0.3})`,
        }}
      >
        {/* Status Badge + Ciclo em uma linha */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--allus-text-secondary)' }}>
            <span className="allus-status-dot" data-status={statusDotStatus} style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
            {statusLabel}
          </div>
          {session && (
            <div style={{ color: cycleColor }}>
              {cycleEmoji} {isFocus ? 'FOCO' : 'PAUSA'}
            </div>
          )}
        </div>

        {/* Timer grande no topo */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--allus-space-2)', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: 'var(--allus-font-mono)',
              fontSize: session ? 36 : 28,
              fontWeight: 700,
              color: session ? alertColor : 'var(--allus-text-muted)',
              letterSpacing: '-0.5px',
            }}
          >
            {session ? formatDuration(remaining) : '–'}
          </div>
          {!snapshot.online && (
            <span title="Sem conexão" style={{ color: 'var(--allus-status-interrompido)', fontSize: 12, marginBottom: 'var(--allus-space-1)' }}>
              ●
            </span>
          )}
        </div>

        {/* Barra de progresso */}
        {session && (
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
                width: `${progress * 100}%`,
                height: '100%',
                background: cycleColor,
                transition: 'width 0.3s ease',
                borderRadius: 3,
              }}
            />
          </div>
        )}
      </div>

      {/* Identificação da tarefa + botão marcar como feita */}
      <div className="allus-no-drag" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div
          style={{
            flex: 1,
            fontSize: 13,
            lineHeight: 1.4,
            color: session ? 'var(--allus-text-primary)' : 'var(--allus-text-muted)',
            wordBreak: 'break-word',
            minHeight: 18,
            fontWeight: 500,
          }}
        >
          {session ? label : 'Nenhum bloco em andamento'}
        </div>
        {session && activeLog && (
          <button
            onClick={() => invokeAction('task:toggleDone', { taskLogId: activeLog.id })}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: activeLog.isDone ? `1.5px solid #4bf5e3` : '1px solid rgba(255,255,255,0.2)',
              background: activeLog.isDone ? 'rgba(79, 245, 227, 0.15)' : 'transparent',
              color: activeLog.isDone ? '#4bf5e3' : 'var(--allus-text-muted)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
            title="Marcar como feita"
          >
            ✓
          </button>
        )}
      </div>

      {/* Controles - dinâmicos por estado */}
      {!session || (session.status === 'Interrompido' || session.status === 'Concluído') ? (
        // Estado: Parado - opções de começar
        <div className="allus-no-drag" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-2)' }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {lastTask ? (
              <>
                <button
                  onClick={() => setModeSelectTask(lastTask)}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1.5px solid rgba(79, 245, 227, 0.5)',
                    background: 'rgba(79, 245, 227, 0.12)',
                    color: '#4bf5e3',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    transition: 'all 0.2s ease',
                  }}
                  title={`Continuar: ${lastTask.title}`}
                >
                  ▶ Continuar
                </button>
                <button
                  onClick={() => setModeSelectTask({ taskId: null, title: '' })}
                  style={{
                    padding: '10px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--allus-text-secondary)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title="Escolher outra tarefa"
                >
                  ↻
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 8,
                  border: '1.5px solid rgba(79, 245, 227, 0.4)',
                  background: 'rgba(79, 245, 227, 0.1)',
                  color: '#4bf5e3',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="Criar e iniciar uma tarefa"
              >
                ▶ Começar
              </button>
            )}
            <button
              style={{
                ...iconBtn,
                transition: 'all 0.2s ease',
              }}
              title="Opacidade"
              onClick={() => setShowOpacityControl((v) => !v)}
            >
              ◐
            </button>
            <button
              style={{
                ...iconBtn,
                transition: 'all 0.2s ease',
              }}
              title="Abrir janela principal"
              onClick={() => window.allus.invoke('window:openMain', undefined)}
            >
              ⤢
            </button>
          </div>
        </div>
      ) : (
        // Estado: Ativo ou Pausado - controles do timer
        <div className="allus-no-drag" style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <button
            onClick={() => invokeAction('timer:playPause', undefined)}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: session.status === 'Ativo' ? '1.5px solid #ffb84d' : '1.5px solid #4bf5e3',
              background:
                session.status === 'Ativo'
                  ? 'rgba(255, 184, 77, 0.12)'
                  : 'rgba(79, 245, 227, 0.12)',
              color: session.status === 'Ativo' ? '#ffb84d' : '#4bf5e3',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title={session.status === 'Ativo' ? 'Pausar (Espaço)' : 'Retomar (Espaço)'}
          >
            {session.status === 'Ativo' ? '⏸ Pausar' : '▶ Retomar'}
          </button>
          <button
            onClick={() => invokeAction('timer:stop', undefined)}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1.5px solid var(--allus-status-interrompido)',
              background: 'rgba(235, 59, 90, 0.12)',
              color: 'var(--allus-status-interrompido)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="Parar completamente — encerra o bloco atual"
          >
            ⏹ Parar
          </button>
          <button
            style={{
              ...iconBtn,
              transition: 'all 0.2s ease',
            }}
            onClick={() => setShowAdd((v) => !v)}
            title="Adicionar tarefa"
          >
            +
          </button>
          <button
            style={{
              ...iconBtn,
              transition: 'all 0.2s ease',
            }}
            title="Opacidade"
            onClick={() => setShowOpacityControl((v) => !v)}
          >
            ◐
          </button>
          <button
            style={{
              ...iconBtn,
              transition: 'all 0.2s ease',
            }}
            title="Abrir janela principal"
            onClick={() => window.allus.invoke('window:openMain', undefined)}
          >
            ⤢
          </button>
        </div>
      )}

      {/* Botão "Pronto" - aparece quando há sessão ativa */}
      {session && (
        <button
          onClick={() =>
            isFocus
              ? invokeAction('timer:skipToBreak', undefined)
              : invokeAction('timer:skipToFocus', undefined)
          }
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 13,
            background: cycleColor,
            color: '#0d0b16',
            transition: 'all 0.2s ease',
            boxShadow: `0 4px 12px ${cycleColor}40`,
          }}
          title={skipLabel}
        >
          ✓ Pronto
        </button>
      )}

      {/* Campo "Nova tarefa" - só aparece quando clica + */}
      {showAdd && (
        <form className="allus-no-drag" onSubmit={submitAdd} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', fontWeight: 500 }}>Adicionar tarefa</div>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nome da tarefa..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              padding: '8px 10px',
              color: 'var(--allus-text-primary)',
              fontSize: 12,
              transition: 'all 0.2s ease',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd(e as any);
              if (e.key === 'Escape') setShowAdd(false);
            }}
          />
          <button
            type="button"
            onClick={() => setShowProjectPicker(true)}
            style={{
              fontSize: 11,
              color: 'var(--allus-text-primary)',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '6px 8px',
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <span>
              <span style={{ color: 'var(--allus-text-muted)' }}>Vai para: </span>
              <strong>{destinoLabel}</strong>
            </span>
            <span>▾</span>
          </button>
        </form>
      )}

      {showProjectPicker && (
        <ProjectPicker
          clients={snapshot.clients}
          projects={snapshot.projects}
          selectedProjectId={snapshot.selectedProjectId}
          onSelect={() => setShowProjectPicker(false)}
          panelRef={projectPickerRef}
        />
      )}

      {/* Break Reminder - quando está em pausa */}
      {session && session.cycleKind === 'Pausa' && session.status === 'Ativo' && (
        <div
          className="allus-no-drag"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(79, 245, 227, 0.1)',
            border: '1px solid rgba(79, 245, 227, 0.25)',
            fontSize: 12,
            color: '#4bf5e3',
            textAlign: 'center',
            fontWeight: 500,
          }}
        >
          💪 Alongue, beba água e descanse!
        </div>
      )}

      {/* Histórico do dia */}
      {(focusHours > 0 || focusMinutes > 0) && (
        <div
          className="allus-no-drag"
          style={{
            fontSize: 11,
            color: 'var(--allus-text-muted)',
            paddingTop: 'var(--allus-space-2)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          📊 Hoje: {focusHours > 0 ? `${focusHours}h` : ''} {focusMinutes}m em {cyclesCompletedToday} {cyclesCompletedToday === 1 ? 'ciclo' : 'ciclos'}
        </div>
      )}

      {/* Minhas horas (7 dias) */}
      <button
        className="allus-no-drag"
        onClick={() => window.allus.invoke('window:openTimeCenter', undefined)}
        style={{
          fontSize: 11,
          color: 'var(--allus-text-muted)',
          background: 'transparent',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
        }}
        title="Abrir Central de Tempos"
      >
        Minhas horas (7 dias): <span style={{ color: '#4bf5e3', fontWeight: 600 }}>{myHoursSeconds === null ? '...' : formatHoursSummary(myHoursSeconds)}</span>
      </button>

      {/* Tarefas recentes */}
      <div className="allus-no-drag" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-2)', marginTop: 'auto', paddingTop: snapshot.recentTasks.length > 0 ? 'var(--allus-space-2)' : 0, borderTop: snapshot.recentTasks.length > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
        {snapshot.recentTasks.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', fontWeight: 500 }}>Recentes</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {snapshot.recentTasks.map((t) => (
            <button
              key={t.id}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                fontSize: 12,
                textAlign: 'left',
                color: 'var(--allus-text-primary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontWeight: 500,
              }}
              onClick={() => setModeSelectTask({ taskId: t.taskId, title: t.taskTitle })}
              title={t.taskTitle}
            >
              {t.taskTitle}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Painel de controle de opacidade - overlay com slider */}
      {showOpacityControl && (
        <div
          className="allus-no-drag"
          ref={opacityPanelRef}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowOpacityControl(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(13, 11, 22, 0.95)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 12,
              padding: '16px',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              minWidth: '200px',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--allus-text-muted)', marginBottom: '12px', fontWeight: 500 }}>
              Opacidade do painel
            </div>
            <input
              type="range"
              min={20}
              max={100}
              value={snapshot?.floatingPanelOpacity ?? 90}
              onChange={(e) => invokeAction('prefs:setFloatingPanelOpacity', { opacity: Number(e.target.value) })}
              style={{
                width: '100%',
                cursor: 'pointer',
              }}
              title={`${snapshot?.floatingPanelOpacity ?? 90}%`}
            />
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginTop: '8px', textAlign: 'center' }}>
              {snapshot?.floatingPanelOpacity ?? 90}%
            </div>
          </div>
        </div>
      )}

      {/* Modal de seleção de tarefa e modo */}
      {modeSelectTask && (
        <TaskModeSelector
          task={modeSelectTask}
          recentTasks={snapshot.recentTasks}
          onSelectTask={setModeSelectTask}
          onClose={() => setModeSelectTask(null)}
          cardRef={modalCardRef}
        />
      )}

      <ToastHost />
    </div>
  );
}

function formatHoursSummary(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--allus-text-primary)',
  fontSize: 14,
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
