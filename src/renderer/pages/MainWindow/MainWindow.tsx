import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import allusWatermark from '../../assets/allus-focus-watermark.svg';
import { useAppState } from '../../useAppState';
import { ProgressRing } from '../../components/ProgressRing';
import { Titlebar } from '../../components/Titlebar';
import { ToastHost } from '../../components/ToastHost';
import { DateFilterBar } from '../../components/DateFilterBar';
import { ProjectPicker } from '../../components/ProjectPicker';
import { TaskSuggestions } from '../../components/TaskSuggestions';
import { Toggle } from '../../components/Toggle';
import { useKeyboardShortcuts } from '../../useKeyboardShortcuts';
import { invokeAction, confirmDialog } from '../../invoke';
import { toast } from '../../toast';
import { useDataRefreshKey } from '../../useDataRefreshKey';
import { Z } from '../../styles/zIndex';
import { POMO_MODES, displayPath, formatDuration } from '../../../shared/types';
import { getAudioContext, playCue } from '../../components/soundUtils';
import type { PomoMode, PomoSession, SessionDateFilter } from '../../../shared/types';

const MODE_RING_COLORS: Record<PomoMode, { colorDeep: string; colorMid: string; colorSoft: string }> = {
  classic: { colorDeep: '#3f9e5e', colorMid: '#7ef29b', colorSoft: '#c3f9d3' },
  deskTime: { colorDeep: 'var(--allus-yellow-deep)', colorMid: 'var(--allus-yellow)', colorSoft: 'var(--allus-yellow-soft)' },
  deepWork: { colorDeep: '#3f5fa8', colorMid: '#8ab4ff', colorSoft: '#c9dbff' },
};

const MOTIVATIONAL_QUOTES: string[] = [
  'Um bloco de cada vez.',
  'Foco é dizer não a mil coisas boas.',
  'Progresso, não perfeição.',
  'O trabalho profundo é raro — e por isso vale.',
  'Comece pequeno, comece agora.',
  'Sua atenção é o recurso mais valioso do dia.',
  'Menos abas, mais foco.',
  'Um pomodoro concluído vale mais que dez planejados.',
  'A tarefa parece grande até você começar.',
  'Feito é melhor que perfeito.',
  'Cada bloco é uma vitória pequena.',
  'Foco não é fazer mais — é fazer o que importa.',
  'O silêncio da concentração também é produtividade.',
  'Distração pedida, foco emprestado.',
  'O relógio corre pra você, não contra.',
  'Trabalho bem feito começa com atenção plena.',
  'Uma pausa bem usada rende o dobro no próximo bloco.',
  'Constância vence intensidade.',
  'Termine o que começou antes de começar outra coisa.',
  'Seu eu de amanhã agradece o foco de hoje.',
  'Não é sobre ter tempo, é sobre dar atenção.',
  'Grandes entregas são feitas de pequenos blocos.',
  'Respire, foque, comece.',
  'O que não é medido, não é lembrado — cronometre.',
  'Menos multitarefa, mais profundidade.',
];

const KEYBOARD_SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Espaço', description: 'Play / Pausar' },
  { keys: 'Ctrl/Cmd + T', description: 'Central de Tarefas' },
  { keys: 'Ctrl/Cmd + H', description: 'Central de Tempos' },
  { keys: 'Ctrl/Cmd + D', description: 'Dashboard' },
  { keys: 'Ctrl/Cmd + P', description: 'Allus Pulse (admin)' },
  { keys: 'Ctrl/Cmd + F', description: 'Focar última tarefa / retomar' },
  { keys: 'Ctrl/Cmd + B', description: 'Pular bloco (foco ↔ pausa)' },
  { keys: 'Esc', description: 'Fechar janela / modal' },
];

export function MainWindow() {
  const snapshot = useAppState();
  const refreshKey = useDataRefreshKey(snapshot);
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
  const [appInfo, setAppInfo] = useState<{ version: string; isDev: boolean; platform: string } | null>(null);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [showFloatingPrefs, setShowFloatingPrefs] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const quickAddWrapRef = useRef<HTMLDivElement | null>(null);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHistoryRefreshing(true);
    window.allus
      .invoke('session:list', { range: { filter: sessionFilter } })
      .then((data) => {
        if (!cancelled) setSessions(data);
      })
      .finally(() => {
        if (!cancelled) setHistoryRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionFilter, refreshKey, historyRefreshTick]);

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

  useEffect(() => {
    if (!showAccount || appInfo) return;
    let cancelled = false;
    invokeAction('app:getInfo', undefined).then((info) => {
      if (!cancelled && info) setAppInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [showAccount, appInfo]);

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

  // Contexto do bloco em foco agora (se houver); sem sessão ativa, mostra
  // pra onde a próxima tarefa vai (mesmo destino usado no quick-add).
  const activeProject = activeLog?.projectId ? snapshot.projects.find((p) => p.id === activeLog.projectId) : null;
  const activeClient = activeProject ? snapshot.clients.find((c) => c.id === activeProject.clientId) : null;
  const contextLabel = activeLog
    ? (activeProject ? displayPath([activeClient?.name, activeProject.name]) : 'Avulsa')
    : destinoLabel;

  const modeColors = MODE_RING_COLORS[snapshot.selectedMode];
  // Escolhe uma frase "aleatória" mas estável — só muda quando o cliente/projeto
  // do contexto muda, não a cada re-render (hash simples da string de contexto).
  const contextQuote = MOTIVATIONAL_QUOTES[hashString(contextLabel) % MOTIVATIONAL_QUOTES.length];

  async function submitQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickAddText.trim()) return;
    setQuickAddSaving(true);
    await invokeAction('task:quickAdd', { title: quickAddText.trim(), avulsa });
    setQuickAddSaving(false);
    setQuickAddText('');
  }

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
      toast.success('Senha alterada com sucesso');
    }
  }

  async function submitNameChange(e: React.FormEvent) {
    e.preventDefault();
    if (!nameField.trim()) return;
    setNameSaving(true);
    await invokeAction('account:updateName', { fullName: nameField.trim() });
    setNameSaving(false);
    toast.success('Nome atualizado');
  }

  async function handleTestSound(cue: 'splash' | 'focusStart' | 'focusEnd' | 'breakEnd' | 'idlePause') {
    const context = await getAudioContext(null);
    if (!context) {
      toast.error('Não consegui abrir o áudio deste sistema.');
      return;
    }

    await playCue(context, cue);
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirmDialog('Excluir este bloco do histórico? Essa ação não pode ser desfeita.')) return;
    await invokeAction('session:delete', { sessionId });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
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
      <Titlebar title="ALLUS FOCUS" onClose={() => window.allus.invoke('window:closeSelf', undefined)} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px' }}>
        <div style={{ flex: 1 }} />
        {!snapshot.online && (
          <span style={{ fontSize: 11, color: 'var(--allus-status-interrompido)' }}>● Sem conexão</span>
        )}
        {snapshot.updateStatus === 'checking' && (
          <span style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>Verificando atualizações...</span>
        )}
        {snapshot.updateStatus === 'downloading' && (
          <span style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>Baixando atualização...</span>
        )}
        {snapshot.updateStatus === 'ready' && (
          <button
            style={{ ...pillButtonStyle, fontSize: 11 }}
            onClick={() => invokeAction('app:restartForUpdate', undefined)}
          >
            Reiniciar para atualizar
          </button>
        )}
        <div className="allus-no-drag" style={{ position: 'relative' }}>
          <button style={pillButtonStyle} onClick={() => setShowAccount((v) => !v)}>
            👤 {snapshot.auth.profile?.fullName ?? 'Conta'}
          </button>
          {showAccount && (
            <div
              className="allus-glass allus-popover-glass"
              style={{ position: 'absolute', right: 0, marginTop: 6, padding: 0, width: 300, zIndex: Z.accountMenu, display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}
            >
              <div style={{ overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-5)' }}>
                {/* Cabeçalho: avatar + nome + função */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: 'var(--allus-yellow)',
                      color: '#000001',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(snapshot.auth.profile?.fullName)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {snapshot.auth.profile?.fullName ?? 'Conta'}
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--allus-text-muted)',
                        border: '1px solid var(--allus-glass-border)',
                        borderRadius: 999,
                        padding: '1px 6px',
                        display: 'inline-block',
                        marginTop: 2,
                      }}
                    >
                      {snapshot.auth.profile?.role === 'admin' ? 'Admin' : 'Membro'}
                    </span>
                  </div>
                </div>

                {/* Bloco: Perfil */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-3)' }}>
                  <div style={sectionHeadingStyle}>👤 Perfil</div>
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
                            color: snapshot.selectedMode === mode ? '#000001' : undefined,
                            fontSize: 11,
                          }}
                        >
                          {POMO_MODES[mode].title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bloco: Minhas Horas — resumo compacto de uma linha, detalhe completo fica na Central de Tempos */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    borderTop: '1px solid var(--allus-glass-border)',
                    paddingTop: 'var(--allus-space-4)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={sectionHeadingStyle}>⏱ Minhas horas · 7 dias</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--allus-yellow)', fontFamily: 'var(--allus-font-mono)', marginTop: 2 }}>
                      {myHoursSeconds === null ? '...' : formatHoursSummary(myHoursSeconds)}
                    </div>
                  </div>
                  <button
                    style={{ ...pillButtonStyle, fontSize: 11 }}
                    onClick={() => window.allus.invoke('window:openTimeCenter', undefined)}
                  >
                    Ver mais →
                  </button>
                </div>

                {/* Bloco: Preferências — agrupa toggles gerais, painel flutuante e notificações, cada subseção recolhível pra reduzir altura padrão */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-3)', borderTop: '1px solid var(--allus-glass-border)', paddingTop: 'var(--allus-space-4)' }}>
                  <div style={sectionHeadingStyle}>⚙️ Preferências</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Toggle
                    checked={snapshot.soundEnabled}
                    onChange={(checked) => invokeAction('prefs:setSound', { enabled: checked })}
                    label="Pacote sonoro"
                  />
                  {snapshot.soundEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
                      <Toggle
                        checked={snapshot.soundSplash}
                        onChange={(checked) => invokeAction('prefs:setSoundOption', { key: 'soundSplash', enabled: checked })}
                        label="Splash"
                      />
                      <Toggle
                        checked={snapshot.soundFocusStart}
                        onChange={(checked) => invokeAction('prefs:setSoundOption', { key: 'soundFocusStart', enabled: checked })}
                        label="Início de foco"
                      />
                      <Toggle
                        checked={snapshot.soundFocusEnd}
                        onChange={(checked) => invokeAction('prefs:setSoundOption', { key: 'soundFocusEnd', enabled: checked })}
                        label="Fim de foco"
                      />
                      <Toggle
                        checked={snapshot.soundBreakEnd}
                        onChange={(checked) => invokeAction('prefs:setSoundOption', { key: 'soundBreakEnd', enabled: checked })}
                        label="Fim de pausa"
                      />
                      <Toggle
                        checked={snapshot.soundIdlePause}
                        onChange={(checked) => invokeAction('prefs:setSoundOption', { key: 'soundIdlePause', enabled: checked })}
                        label="Pausa por inatividade"
                      />
                    </div>
                  )}
                  {snapshot.soundEnabled && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button type="button" style={pillButtonStyle} onClick={() => handleTestSound('splash')}>
                        Splash
                      </button>
                      <button type="button" style={pillButtonStyle} onClick={() => handleTestSound('focusStart')}>
                        Início
                      </button>
                      <button type="button" style={pillButtonStyle} onClick={() => handleTestSound('focusEnd')}>
                        Fim foco
                      </button>
                      <button type="button" style={pillButtonStyle} onClick={() => handleTestSound('breakEnd')}>
                        Fim pausa
                      </button>
                      <button type="button" style={pillButtonStyle} onClick={() => handleTestSound('idlePause')}>
                        Inatividade
                      </button>
                    </div>
                  )}
                  <Toggle
                    checked={snapshot.floatingMinimizable}
                    onChange={(checked) => invokeAction('prefs:setFloatingMinimizable', { enabled: checked })}
                    label="Painel flutuante minimiza com a janela principal"
                  />
                    <Toggle
                      checked={snapshot.autoLaunchEnabled}
                      onChange={(checked) => invokeAction('prefs:setAutoLaunch', { enabled: checked })}
                      label="Iniciar automaticamente com o Windows"
                    />
                  </div>

                  <CollapsibleSubsection
                    title="Painel flutuante"
                    open={showFloatingPrefs}
                    onToggle={() => setShowFloatingPrefs((v) => !v)}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginBottom: 6 }}>
                        Opacidade — {snapshot.floatingPanelOpacity}%
                      </div>
                      <input
                        type="range"
                        className="allus-slider"
                        min={0}
                        max={100}
                        value={snapshot.floatingPanelOpacity}
                        onChange={(e) => invokeAction('prefs:setFloatingPanelOpacity', { opacity: Number(e.target.value) })}
                      />
                    </div>
                    <Toggle
                      checked={snapshot.floatingPanelSizeLocked}
                      onChange={(checked) => {
                        window.allus.invoke('window:setFloatingSizeLocked', { locked: checked });
                        invokeAction('prefs:setFloatingPanelSizeLocked', { locked: checked });
                      }}
                      label="Travar tamanho do painel"
                    />
                  </CollapsibleSubsection>

                  <CollapsibleSubsection
                    title="Notificações"
                    open={showNotifPrefs}
                    onToggle={() => setShowNotifPrefs((v) => !v)}
                  >
                    <Toggle
                      checked={snapshot.auth.profile?.preferences.notifyFocusStart ?? true}
                      onChange={(checked) => invokeAction('prefs:setNotify', { event: 'focusStart', enabled: checked })}
                      label="Início de bloco de foco"
                    />
                    <Toggle
                      checked={snapshot.auth.profile?.preferences.notifyFocusEnd ?? true}
                      onChange={(checked) => invokeAction('prefs:setNotify', { event: 'focusEnd', enabled: checked })}
                      label="Fim de foco (início da pausa)"
                    />
                    <Toggle
                      checked={snapshot.auth.profile?.preferences.notifyBreakEnd ?? true}
                      onChange={(checked) => invokeAction('prefs:setNotify', { event: 'breakEnd', enabled: checked })}
                      label="Fim de pausa"
                    />
                  </CollapsibleSubsection>
                </div>

                {snapshot.auth.profile?.role === 'admin' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-2)' }}>
                    <button
                      type="button"
                      onClick={() => invokeAction('window:openMembers', undefined)}
                      style={{ ...pillButtonStyle, alignSelf: 'flex-start' }}
                    >
                      Gerenciar membros da equipe
                    </button>
                  </div>
                )}
                {/* Bloco: Atalhos de teclado */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-2)', borderTop: '1px solid var(--allus-glass-border)', paddingTop: 'var(--allus-space-4)' }}>
                  <button
                    type="button"
                    onClick={() => setShowShortcuts((v) => !v)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--allus-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {showShortcuts ? '▾' : '▸'} Atalhos de teclado
                  </button>
                  {showShortcuts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                      {KEYBOARD_SHORTCUTS.map((s) => (
                        <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                          <span style={{ color: 'var(--allus-text-secondary)' }}>{s.description}</span>
                          <span style={{ fontFamily: 'var(--allus-font-mono)', color: 'var(--allus-text-muted)', whiteSpace: 'nowrap' }}>{s.keys}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bloco: Sobre */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTop: '1px solid var(--allus-glass-border)', paddingTop: 'var(--allus-space-4)' }}>
                  <span style={{ fontSize: 10, color: 'var(--allus-text-muted)' }}>
                    Allus Focus {appInfo ? `v${appInfo.version}` : ''}
                  </span>
                  {appInfo?.isDev && (
                    <button
                      onClick={() =>
                        window.allus.invoke('window:openDevTools', undefined).catch((err) => {
                          console.error('[MainWindow] falha ao abrir DevTools', err);
                        })
                      }
                      style={{
                        padding: '4px 8px',
                        fontSize: 9,
                        color: 'var(--allus-text-muted)',
                        background: 'transparent',
                        border: '1px dashed rgba(255,255,255,0.1)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      title="Abrir developer tools (F12)"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--allus-text-muted)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                      }}
                    >
                      🔧 Console
                    </button>
                  )}
                </div>
              </div>

              {/* Zona de perigo: senha + sair — fixada no rodapé do dropdown */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--allus-space-3)',
                  padding: 14,
                  borderTop: '1px solid rgba(255,107,107,0.25)',
                  background: 'rgba(255,107,107,0.05)',
                  flexShrink: 0,
                }}
              >
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
                  style={{
                    ...pillButtonStyle,
                    width: '100%',
                    color: 'var(--allus-status-interrompido)',
                    border: '1px solid rgba(255,107,107,0.4)',
                    fontWeight: 600,
                  }}
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
          <span
            style={{
              fontSize: 11,
              color: 'var(--allus-text-muted)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--allus-glass-border)',
              borderRadius: 999,
              padding: '3px 10px',
            }}
          >
            {contextLabel}
          </span>
          <ProgressRing progress={progressValue} label={formatDuration(remaining)} sublabel={cycleLabel} {...modeColors} />
          <div style={{ fontSize: 14, color: 'var(--allus-text-secondary)' }}>{taskLabel}</div>
          <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', fontStyle: 'italic', textAlign: 'center', maxWidth: 280 }}>
            {contextQuote}
          </div>
        </section>

        {/* Atalhos de navegação — separados do form de nova tarefa, sem relação com ele */}
        <div className="allus-no-drag" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            type="button"
            style={pillButtonStyle}
            onClick={() => window.allus.invoke('window:openFloating', undefined)}
            title="Painel flutuante (ESC para fechar)"
          >
            🪟 Painel
          </button>
          <button
            type="button"
            style={pillButtonStyle}
            onClick={() => window.allus.invoke('window:toggleTaskCenter', undefined)}
            title="Tarefas (Ctrl+T ou clique novamente)"
          >
            📁 Tarefas
          </button>
          <button
            type="button"
            style={pillButtonStyle}
            onClick={() => window.allus.invoke('window:toggleTimeCenter', undefined)}
            title="Minhas horas (Ctrl+H ou clique novamente)"
          >
            📊 Horas
          </button>
          <button
            type="button"
            style={pillButtonStyle}
            onClick={() => window.allus.invoke('window:toggleDashboard', undefined)}
            title="Dashboard (Ctrl+D ou clique novamente)"
          >
            📈 Dashboard
          </button>
          {snapshot?.auth.profile?.role === 'admin' && (
            <button
              type="button"
              style={pillButtonStyle}
              onClick={() => window.allus.invoke('window:togglePulse', undefined)}
              title="Allus Pulse (Ctrl+P ou clique novamente)"
            >
              💠 Pulse
            </button>
          )}
        </div>

        {snapshot.clients.length === 0 && (
          <section className="allus-glass" style={{ padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Bem-vindo(a) ao Allus Focus 👋</div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: 'var(--allus-text-muted)' }}>
              TAREFAS DO BLOCO
            </div>
            {snapshot.activeTaskLogs.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>
                {snapshot.activeTaskLogs.filter((l) => l.isDone).length}/{snapshot.activeTaskLogs.length}
              </div>
            )}
          </div>
          {snapshot.activeTaskLogs.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>📋</div>
              <div style={{ fontSize: 13, color: 'var(--allus-text-secondary)' }}>Nenhuma tarefa neste bloco ainda.</div>
              <div style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>
                Adicione uma tarefa na barra de modo abaixo pra começar a cronometrar.
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...snapshot.activeTaskLogs]
              .sort((a, b) => {
                const aActive = a.id === session?.activeTaskLogId;
                const bActive = b.id === session?.activeTaskLogId;
                if (aActive !== bActive) return aActive ? -1 : 1;
                if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
                return 0;
              })
              .map((log) => {
                const isActive = log.id === session?.activeTaskLogId;
                return (
                  <div
                    key={log.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: isActive ? 'rgba(236,220,1,0.10)' : 'transparent',
                      borderLeft: isActive ? '3px solid var(--allus-yellow)' : '3px solid transparent',
                      opacity: log.isDone ? 0.55 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={log.isDone}
                      onChange={() => invokeAction('task:toggleDone', { taskLogId: log.id })}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          textDecoration: log.isDone ? 'line-through' : 'none',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {log.taskTitle}
                      </div>
                      {isActive && (
                        <div style={{ fontSize: 10, color: 'var(--allus-yellow)', fontWeight: 600, marginTop: 1 }}>
                          ● Focando agora
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--allus-font-mono)', fontSize: 12, color: 'var(--allus-text-secondary)' }}>
                      {formatDuration(log.elapsedSeconds)}
                    </div>
                    {!isActive && (
                      <button
                        style={pillButtonStyle}
                        onClick={() => invokeAction('task:focus', { taskId: log.taskId, subtaskId: null, title: log.taskTitle })}
                      >
                        Focar
                      </button>
                    )}
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
                );
              })}
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
                  color: snapshot.selectedMode === mode ? '#000001' : undefined,
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

          <form onSubmit={submitQuickAdd} style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative', zIndex: 2 }}>
            <div ref={quickAddWrapRef} style={{ flex: 1, position: 'relative', zIndex: 2 }}>
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
                anchorRect={quickAddWrapRef.current?.getBoundingClientRect() ?? null}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input type="checkbox" checked={avulsa} onChange={(e) => setAvulsa(e.target.checked)} /> Avulsa
            </label>
            <button type="submit" style={pillButtonStyle} disabled={quickAddSaving}>
              {quickAddSaving ? '...' : '+'}
            </button>
          </form>
        </section>

        {/* B) Datasheet */}
        <section className="allus-glass" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: 'var(--allus-text-muted)' }}>HISTÓRICO</div>
            <div style={{ flex: 1 }} />
            <button
              style={historyRefreshButtonStyle}
              onClick={() => setHistoryRefreshTick((tick) => tick + 1)}
              disabled={historyRefreshing}
              title="Atualizar histórico"
            >
              {historyRefreshing ? 'Atualizando...' : '↻ Atualizar'}
            </button>
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

function CollapsibleSubsection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--allus-text-muted)',
          fontSize: 11,
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: open ? 6 : 0,
        }}
      >
        {open ? '▾' : '▸'} {title}
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 2 }}>{children}</div>}
    </div>
  );
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getInitials(fullName: string | undefined): string {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

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

const historyRefreshButtonStyle: React.CSSProperties = {
  minHeight: 28,
  padding: '5px 11px',
  borderRadius: 10,
  border: '1px solid rgba(236, 220, 1, 0.22)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--allus-text-primary)',
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

const dotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  marginRight: 4,
};
