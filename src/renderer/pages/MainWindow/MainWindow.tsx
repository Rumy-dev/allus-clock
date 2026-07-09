import { useEffect, useState } from 'react';
import { useAppState } from '../../useAppState';
import { ProgressRing } from '../../components/ProgressRing';
import { Titlebar } from '../../components/Titlebar';
import { ToastHost } from '../../components/ToastHost';
import { DateFilterBar } from '../../components/DateFilterBar';
import { ProjectPicker } from '../../components/ProjectPicker';
import { TaskSuggestions } from '../../components/TaskSuggestions';
import { Tooltip } from '../../components/Tooltip';
import { useKeyboardShortcuts } from '../../useKeyboardShortcuts';
import { invokeAction, confirmDialog } from '../../invoke';
import { POMO_MODES, displayPath, formatDuration } from '../../../shared/types';
import type { PomoMode, PomoSession, SessionDateFilter } from '../../../shared/types';

export function MainWindow() {
  const snapshot = useAppState();
  const [sessions, setSessions] = useState<PomoSession[]>([]);
  const [sessionFilter, setSessionFilter] = useState<SessionDateFilter>('Todas');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 20;
  const [quickAddText, setQuickAddText] = useState('');
  const [avulsa, setAvulsa] = useState(false);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [onboardClient, setOnboardClient] = useState('');
  const [onboardProject, setOnboardProject] = useState('');
  const [onboardSaving, setOnboardSaving] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [nameField, setNameField] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [myHoursSeconds, setMyHoursSeconds] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.allus.invoke('session:list', { range: { filter: sessionFilter } }).then((data) => {
      if (!cancelled) setSessions(data);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionFilter, snapshot?.activeSession?.id, snapshot?.activeSession?.status]);

  useEffect(() => {
    setHistoryPage(1);
  }, [sessionFilter]);

  useEffect(() => {
    if (!showAccount || !snapshot?.auth.profile) return;
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
  }, [showAccount, snapshot?.auth.profile?.id]);

  useKeyboardShortcuts({
    onPlayPause: () => invokeAction('timer:playPause', undefined),
    onEscape: () => {
      setShowProjectPicker(false);
      setShowAccount(false);
    },
  });

  useEffect(() => {
    if (snapshot?.auth.profile) setNameField(snapshot.auth.profile.fullName);
  }, [snapshot?.auth.profile?.fullName]);

  if (!snapshot) {
    return <div className="allus-app-bg" style={{ height: '100%' }} />;
  }

  const session = snapshot.activeSession;
  const remaining = session ? Math.max(0, session.plannedSeconds - session.elapsedSeconds) : POMO_MODES[snapshot.selectedMode].focusSeconds;
  const progressValue = session ? session.elapsedSeconds / Math.max(1, session.plannedSeconds) : 0;
  const cycleLabel = session?.cycleKind === 'Pausa' ? 'PAUSA' : 'FOCO';
  const activeLog = session ? snapshot.activeTaskLogs.find((l) => l.id === session.activeTaskLogId) : null;
  const taskLabel = activeLog?.taskTitle ?? (session ? session.task : 'Nenhuma sessão ativa');

  const destinoProject = snapshot.projects.find((p) => p.id === snapshot.selectedProjectId);
  const destinoClient = destinoProject ? snapshot.clients.find((c) => c.id === destinoProject.clientId) : null;
  const destinoLabel = avulsa ? 'Avulsa' : destinoProject ? displayPath([destinoClient?.name, destinoProject.name]) : 'Avulsa';

  async function submitQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickAddText.trim()) return;
    setQuickAddSaving(true);
    await invokeAction('task:quickAdd', { title: quickAddText.trim(), avulsa });
    setQuickAddSaving(false);
    setQuickAddText('');
  }

  const skipLabel = session?.cycleKind === 'Pausa' ? 'Pular descanso' : 'Pular bloco';

  async function submitOnboarding(e: React.FormEvent) {
    e.preventDefault();
    if (!onboardClient.trim() || !onboardProject.trim()) return;
    setOnboardSaving(true);
    await invokeAction('project:add', { clientName: onboardClient.trim(), projectName: onboardProject.trim(), type: '' });
    setOnboardSaving(false);
    setOnboardClient('');
    setOnboardProject('');
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) return;
    setPasswordSaving(true);
    const result = await invokeAction('auth:changePassword', { newPassword });
    setPasswordSaving(false);
    if (result?.ok) {
      setNewPassword('');
      setShowPasswordForm(false);
      setShowAccount(false);
    }
  }

  async function submitNameChange(e: React.FormEvent) {
    e.preventDefault();
    if (!nameField.trim()) return;
    setNameSaving(true);
    await invokeAction('account:updateName', { fullName: nameField.trim() });
    setNameSaving(false);
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirmDialog('Excluir este bloco do histórico? Essa ação não pode ser desfeita.')) return;
    await invokeAction('session:delete', { sessionId });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

  return (
    <div className="allus-app-bg" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Titlebar
        title="NEURO-POMO · ALLUS CLOCK"
        subtitle="Fechar mantém o timer rodando no painel flutuante e na bandeja"
        onClose={() => window.allus.invoke('window:closeSelf', undefined)}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px' }}>
        <div style={{ flex: 1 }} />
        {!snapshot.online && (
          <span style={{ fontSize: 11, color: 'var(--allus-status-interrompido)' }}>● Sem conexão</span>
        )}
        <div className="allus-no-drag" style={{ position: 'relative' }}>
          <button style={pillButtonStyle} onClick={() => setShowAccount((v) => !v)}>
            👤 {snapshot.auth.profile?.fullName ?? 'Conta'}
          </button>
          {showAccount && (
            <div
              className="allus-glass"
              style={{ position: 'absolute', right: 0, marginTop: 6, padding: 14, width: 280, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-5)', maxHeight: '80vh', overflowY: 'auto' }}
            >
              {/* Bloco: Perfil */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-3)' }}>
                <div style={sectionHeadingStyle}>Perfil</div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 6 }}>Nome de exibição</div>
                  <form onSubmit={submitNameChange} style={{ display: 'flex', gap: 6 }}>
                    <input value={nameField} onChange={(e) => setNameField(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    <button type="submit" style={pillButtonStyle} disabled={nameSaving}>
                      {nameSaving ? '...' : 'Salvar'}
                    </button>
                  </form>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 6 }}>Modo padrão</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(Object.keys(POMO_MODES) as PomoMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => invokeAction('timer:setMode', { mode })}
                        style={{
                          ...pillButtonStyle,
                          backgroundImage: snapshot.selectedMode === mode ? 'var(--allus-gradient)' : undefined,
                          color: snapshot.selectedMode === mode ? '#0d0b16' : undefined,
                          fontSize: 11,
                        }}
                      >
                        {POMO_MODES[mode].title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bloco: Minhas Horas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-2)', borderTop: '1px solid var(--allus-glass-border)', paddingTop: 'var(--allus-space-4)' }}>
                <div style={sectionHeadingStyle}>Minhas horas</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#4bf5e3', fontFamily: 'var(--allus-font-mono)' }}>
                  {myHoursSeconds === null ? '...' : formatHoursSummary(myHoursSeconds)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>Últimos 7 dias</div>
                <button
                  style={{ ...pillButtonStyle, alignSelf: 'flex-start', fontSize: 11 }}
                  onClick={() => window.allus.invoke('window:openTimeCenter', undefined)}
                >
                  Ver histórico completo →
                </button>
              </div>

              {/* Bloco: Preferências */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-3)', borderTop: '1px solid var(--allus-glass-border)', paddingTop: 'var(--allus-space-4)' }}>
                <div style={sectionHeadingStyle}>Preferências</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={snapshot.soundEnabled}
                      onChange={(e) => invokeAction('prefs:setSound', { enabled: e.target.checked })}
                    />
                    Som ao concluir bloco
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={snapshot.floatingMinimizable}
                      onChange={(e) => invokeAction('prefs:setFloatingMinimizable', { enabled: e.target.checked })}
                    />
                    Painel flutuante minimiza com a janela principal
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={snapshot.autoLaunchEnabled}
                      onChange={(e) => invokeAction('prefs:setAutoLaunch', { enabled: e.target.checked })}
                    />
                    Iniciar automaticamente com o Windows
                  </label>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 6 }}>Notificações</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={snapshot.auth.profile?.preferences.notifyFocusStart ?? true}
                        onChange={(e) => invokeAction('prefs:setNotify', { event: 'focusStart', enabled: e.target.checked })}
                      />
                      Início de bloco de foco
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={snapshot.auth.profile?.preferences.notifyFocusEnd ?? true}
                        onChange={(e) => invokeAction('prefs:setNotify', { event: 'focusEnd', enabled: e.target.checked })}
                      />
                      Fim de foco (início da pausa)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={snapshot.auth.profile?.preferences.notifyBreakEnd ?? true}
                        onChange={(e) => invokeAction('prefs:setNotify', { event: 'breakEnd', enabled: e.target.checked })}
                      />
                      Fim de pausa
                    </label>
                  </div>
                </div>
              </div>

              {/* Bloco: Conta */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-3)', borderTop: '1px solid var(--allus-glass-border)', paddingTop: 'var(--allus-space-4)' }}>
                <div style={sectionHeadingStyle}>Conta</div>

                {!showPasswordForm ? (
                  <button
                    type="button"
                    onClick={() => setShowPasswordForm(true)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--allus-text-secondary)', fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                  >
                    Alterar senha
                  </button>
                ) : (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 6 }}>Nova senha</div>
                    <form onSubmit={submitPasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        autoFocus
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Nova senha (mín. 6 caracteres)"
                        style={inputStyle}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="submit" style={{ ...pillButtonStyle, flex: 1 }} disabled={passwordSaving}>
                          {passwordSaving ? 'Salvando...' : 'Salvar nova senha'}
                        </button>
                        <button
                          type="button"
                          style={pillButtonStyle}
                          onClick={() => {
                            setShowPasswordForm(false);
                            setNewPassword('');
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <button
                  style={{ ...pillButtonStyle, width: '100%', color: 'var(--allus-status-interrompido)' }}
                  onClick={() => invokeAction('auth:signOut', undefined)}
                >
                  Sair da conta
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* A) Cabeçalho */}
        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <ProgressRing progress={progressValue} label={formatDuration(remaining)} sublabel={cycleLabel} />
          <div style={{ fontSize: 14, color: 'var(--allus-text-secondary)' }}>{taskLabel}</div>
        </section>

        {snapshot.clients.length === 0 && (
          <section className="allus-glass" style={{ padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Bem-vindo(a) ao Allus Clock 👋</div>
            <div style={{ fontSize: 13, color: 'var(--allus-text-secondary)', maxWidth: 420 }}>
              Ainda não existe nenhum cliente/projeto no time. Crie o primeiro abaixo — ele fica disponível
              pra todo mundo. (Se quiser só cronometrar algo rápido sem organizar por cliente, marque
              "Avulsa" mais abaixo e comece direto.)
            </div>
            <form onSubmit={submitOnboarding} style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 420 }}>
              <input
                value={onboardClient}
                onChange={(e) => setOnboardClient(e.target.value)}
                placeholder="Nome do cliente"
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                value={onboardProject}
                onChange={(e) => setOnboardProject(e.target.value)}
                placeholder="Nome do projeto"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="submit" style={pillButtonStyle} disabled={onboardSaving}>
                {onboardSaving ? 'Salvando...' : 'Criar'}
              </button>
            </form>
          </section>
        )}

        {/* C) Tarefas do bloco */}
        <section className="allus-glass" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: 'var(--allus-text-muted)', marginBottom: 10 }}>
            TAREFAS DO BLOCO
          </div>
          {snapshot.activeTaskLogs.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--allus-text-muted)' }}>Nenhuma tarefa neste bloco ainda.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {snapshot.activeTaskLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: log.id === session?.activeTaskLogId ? 'rgba(255,255,255,0.08)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={log.isDone}
                  onChange={() => invokeAction('task:toggleDone', { taskLogId: log.id })}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{log.taskTitle}</div>
                </div>
                <div style={{ fontFamily: 'var(--allus-font-mono)', fontSize: 12, color: 'var(--allus-text-secondary)' }}>
                  {formatDuration(log.elapsedSeconds)}
                </div>
                <button
                  style={pillButtonStyle}
                  onClick={() => invokeAction('task:focus', { taskId: log.taskId, subtaskId: null, title: log.taskTitle })}
                >
                  Focar
                </button>
                <button
                  style={iconGhostButtonStyle}
                  onClick={async () => {
                    if (!confirmDialog(`Remover "${log.taskTitle}" deste bloco?`)) return;
                    await invokeAction('task:deleteLog', { taskLogId: log.id });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* D) Troca rápida */}
        {snapshot.recentTasks.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {snapshot.recentTasks.map((t) => (
              <button
                key={t.id}
                style={pillButtonStyle}
                onClick={() => invokeAction('task:focus', { taskId: t.taskId, subtaskId: null, title: t.taskTitle })}
              >
                {t.taskTitle}
              </button>
            ))}
          </div>
        )}

        {/* E) Barra de modo */}
        <section className="allus-glass" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(Object.keys(POMO_MODES) as PomoMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => invokeAction('timer:setMode', { mode })}
                style={{
                  ...pillButtonStyle,
                  backgroundImage: snapshot.selectedMode === mode ? 'var(--allus-gradient)' : undefined,
                  color: snapshot.selectedMode === mode ? '#0d0b16' : undefined,
                  fontWeight: snapshot.selectedMode === mode ? 700 : 400,
                }}
              >
                {POMO_MODES[mode].title}
              </button>
            ))}
          </div>

          <div className="allus-no-drag" style={{ position: 'relative' }}>
            <button
              onClick={() => setShowProjectPicker((v) => !v)}
              style={{
                fontSize: 12,
                color: 'var(--allus-text-primary)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--allus-glass-border)',
                borderRadius: 8,
                padding: '6px 10px',
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
            >
              <span>
                <span style={{ color: 'var(--allus-text-muted)', fontSize: 10 }}>Tarefas vão para: </span>
                <strong>{destinoLabel}</strong>
              </span>
              <span>▾</span>
            </button>
            {showProjectPicker && (
              <ProjectPicker
                clients={snapshot.clients}
                projects={snapshot.projects}
                selectedProjectId={snapshot.selectedProjectId}
                onSelect={() => setShowProjectPicker(false)}
              />
            )}
          </div>

          <form onSubmit={submitQuickAdd} style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
                placeholder="Nova tarefa..."
                style={{ width: '100%', ...inputStyle }}
              />
              <TaskSuggestions
                query={quickAddText}
                tasks={snapshot.tasks}
                projects={snapshot.projects}
                clients={snapshot.clients}
                onPick={() => setQuickAddText('')}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input type="checkbox" checked={avulsa} onChange={(e) => setAvulsa(e.target.checked)} /> Avulsa
            </label>
            <button type="submit" style={pillButtonStyle} disabled={quickAddSaving}>
              {quickAddSaving ? '...' : '+'}
            </button>
            <Tooltip text="Painel flutuante (ESC para fechar)">
              <button
                type="button"
                style={pillButtonStyle}
                onClick={() => window.allus.invoke('window:openFloating', undefined)}
              >
                🪟
              </button>
            </Tooltip>
            <Tooltip text="Tarefas (Ctrl+T ou clique novamente)">
              <button
                type="button"
                style={pillButtonStyle}
                onClick={() => window.allus.invoke('window:toggleTaskCenter', undefined)}
              >
                📁
              </button>
            </Tooltip>
            <Tooltip text="Minhas horas (Ctrl+H ou clique novamente)">
              <button
                type="button"
                style={pillButtonStyle}
                onClick={() => window.allus.invoke('window:toggleTimeCenter', undefined)}
              >
                📊
              </button>
            </Tooltip>
            <Tooltip text="Dashboard (Ctrl+D ou clique novamente)">
              <button
                type="button"
                style={pillButtonStyle}
                onClick={() => window.allus.invoke('window:toggleDashboard', undefined)}
              >
                📈
              </button>
            </Tooltip>
            {snapshot?.auth.profile?.role === 'admin' && (
              <Tooltip text="Allus Pulse (Ctrl+P ou clique novamente)">
                <button
                  type="button"
                  style={pillButtonStyle}
                  onClick={() => window.allus.invoke('window:togglePulse', undefined)}
                >
                  💠
                </button>
              </Tooltip>
            )}
          </form>
        </section>

        {/* B) Datasheet */}
        <section className="allus-glass" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: 'var(--allus-text-muted)' }}>HISTÓRICO</div>
            <div style={{ flex: 1 }} />
            <DateFilterBar value={sessionFilter} onChange={setSessionFilter} />
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sessions.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 0', color: 'var(--allus-text-muted)' }}>
                <div style={{ fontSize: 24 }}>🗒️</div>
                <div style={{ fontSize: 13 }}>Nenhum bloco neste período.</div>
              </div>
            )}
            {sessions.slice(0, historyPage * HISTORY_PAGE_SIZE).map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px 70px 70px 90px 70px',
                  gap: 8,
                  fontSize: 12,
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <span>{s.task}</span>
                <span>{POMO_MODES[s.mode].tableTitle}</span>
                <span style={{ fontFamily: 'var(--allus-font-mono)' }}>{formatDuration(s.plannedSeconds)}</span>
                <span style={{ fontFamily: 'var(--allus-font-mono)' }}>{formatDuration(s.elapsedSeconds)}</span>
                <span>
                  <span className="allus-status-dot" data-status={s.status} style={dotStyle} /> {s.status}
                </span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button
                    title="Retomar"
                    style={iconGhostButtonStyle}
                    onClick={() => invokeAction('timer:restart', { sessionId: s.id })}
                  >
                    ▶
                  </button>
                  <button title="Excluir" style={iconGhostButtonStyle} onClick={() => handleDeleteSession(s.id)}>
                    ✕
                  </button>
                </span>
              </div>
            ))}
            {sessions.length > historyPage * HISTORY_PAGE_SIZE && (
              <button
                style={{ ...pillButtonStyle, alignSelf: 'center', marginTop: 4 }}
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                Carregar mais
              </button>
            )}
          </div>
        </section>
      </div>

      {/* F) Controles inferiores */}
      <div
        className="allus-glass allus-no-drag"
        style={{ margin: 16, marginTop: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <button style={primaryButtonStyle} onClick={() => invokeAction('timer:playPause', undefined)} title="Espaço">
          {session?.status === 'Ativo' ? '⏸' : '▶'}
        </button>
        <button style={pillButtonStyle} onClick={() => invokeAction('timer:stop', undefined)}>
          ⏹
        </button>
        <button
          style={pillButtonStyle}
          onClick={() =>
            session?.cycleKind === 'Pausa'
              ? invokeAction('timer:skipToFocus', undefined)
              : invokeAction('timer:skipToBreak', undefined)
          }
        >
          {skipLabel}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>
          Som e outras preferências: botão "Conta" no topo
        </span>
      </div>
      <ToastHost />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--allus-glass-border)',
  borderRadius: 10,
  padding: '8px 10px',
  color: 'var(--allus-text-primary)',
  outline: 'none',
  fontSize: 13,
};

function formatHoursSummary(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--allus-text-muted)',
};

const pillButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid var(--allus-glass-border)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--allus-text-primary)',
  fontSize: 12,
};

const iconGhostButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--allus-text-muted)',
  fontSize: 12,
};

const primaryButtonStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: 'none',
  backgroundImage: 'var(--allus-gradient)',
  color: '#0d0b16',
  fontSize: 16,
};

const dotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  marginRight: 4,
};
