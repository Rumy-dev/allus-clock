import { useMemo, useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import allusWatermark from '../../assets/allus-focus-watermark.svg';
import { useAppState } from '../../useAppState';
import { Titlebar } from '../../components/Titlebar';
import { ToastHost } from '../../components/ToastHost';
import { ContextMenu } from '../../components/ContextMenu';
import type { ContextMenuItem } from '../../components/ContextMenu';
import { invokeAction, confirmDialog } from '../../invoke';
import type { Client, Project, Task, TeamMember } from '../../../shared/types';
import { Z } from '../../styles/zIndex';

interface Clipboard {
  taskId: string;
  title: string;
  cut: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export function TaskCenter() {
  const snapshot = useAppState();
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [clientField, setClientField] = useState('');
  const [projectField, setProjectField] = useState('');
  const [typeField, setTypeField] = useState('');
  const [newTaskField, setNewTaskField] = useState('');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [newSubtaskField, setNewSubtaskField] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [moveTask, setMoveTask] = useState<Task | null>(null);
  const [propsTask, setPropsTask] = useState<Task | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.allus.invoke('window:closeSelf', undefined);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const grouped = useMemo(() => {
    if (!snapshot) return [];
    const term = search.trim().toLowerCase();
    const clients = snapshot.clients
      .map((client) => {
        const projects = snapshot.projects.filter((p) => p.clientId === client.id);
        return { client, projects };
      })
      .filter(
        ({ client, projects }) =>
          !term ||
          client.name.toLowerCase().includes(term) ||
          projects.some((p) => p.name.toLowerCase().includes(term)),
      );
    return clients;
  }, [snapshot, search]);

  if (!snapshot) return <div className="allus-app-bg" style={{ height: '100%' }} />;

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function selectProjectForEdit(project: Project | null) {
    setSelectedProjectId(project?.id ?? null);
    if (project) {
      const client = snapshot!.clients.find((c) => c.id === project.clientId);
      setClientField(client?.name ?? '');
      setProjectField(project.name);
      setTypeField(project.type ?? '');
    } else {
      setClientField('');
      setProjectField('');
      setTypeField('');
    }
  }

  async function saveProject() {
    setSavingProject(true);
    if (selectedProjectId) {
      await invokeAction('project:update', {
        projectId: selectedProjectId,
        clientName: clientField,
        projectName: projectField,
        type: typeField,
      });
    } else {
      await invokeAction('project:add', { clientName: clientField, projectName: projectField, type: typeField });
    }
    setSavingProject(false);
    selectProjectForEdit(null);
  }

  async function deleteProjectById(project: Project) {
    if (!confirmDialog(`Excluir o projeto "${project.name}"? As tarefas dentro dele também serão apagadas.`)) return;
    await invokeAction('project:delete', { projectId: project.id });
    if (selectedProjectId === project.id) selectProjectForEdit(null);
  }

  async function addTaskToSelected() {
    if (!selectedProjectId || !newTaskField.trim()) return;
    setAddingTask(true);
    await invokeAction('taskTree:add', { projectId: selectedProjectId, parentTaskId: null, title: newTaskField.trim() });
    setAddingTask(false);
    setNewTaskField('');
  }

  async function deleteTask(task: Task) {
    if (!confirmDialog(`Excluir "${task.title}"?`)) return;
    await invokeAction('taskTree:delete', { taskId: task.id });
  }

  async function pasteInto(project: Project) {
    if (!clipboard) return;
    await invokeAction('taskTree:add', { projectId: project.id, parentTaskId: null, title: clipboard.title });
    if (clipboard.cut) {
      await invokeAction('taskTree:delete', { taskId: clipboard.taskId });
    }
    setClipboard(null);
  }

  function topLevelTasks(projectId: string): Task[] {
    return snapshot!.tasks.filter((t) => t.projectId === projectId && !t.parentTaskId);
  }

  function subtasksOf(taskId: string): Task[] {
    return snapshot!.tasks.filter((t) => t.parentTaskId === taskId);
  }

  function openProjectMenu(pos: { x: number; y: number }, project: Project) {
    const items: ContextMenuItem[] = [
      { label: 'Selecionar', onClick: () => selectProjectForEdit(project) },
      {
        label: 'Colar tarefa aqui',
        disabled: !clipboard,
        onClick: () => pasteInto(project),
      },
      { label: 'Apagar projeto', danger: true, onClick: () => deleteProjectById(project) },
    ];
    setMenu({ x: pos.x, y: pos.y, items });
  }

  function openTaskMenu(pos: { x: number; y: number }, task: Task) {
    const items: ContextMenuItem[] = [
      { label: 'Focar', onClick: () => invokeAction('task:focus', { taskId: task.id, subtaskId: null, title: task.title }) },
      { label: 'Renomear', onClick: () => setRenaming({ id: task.id, value: task.title }) },
      { label: 'Copiar', onClick: () => setClipboard({ taskId: task.id, title: task.title, cut: false }) },
      { label: 'Recortar', onClick: () => setClipboard({ taskId: task.id, title: task.title, cut: true }) },
      { label: 'Mover para...', onClick: () => setMoveTask(task) },
      { label: 'Propriedades', onClick: () => setPropsTask(task) },
      { label: 'Apagar', danger: true, onClick: () => deleteTask(task) },
    ];
    setMenu({ x: pos.x, y: pos.y, items });
  }

  function onProjectContextMenu(e: React.MouseEvent, project: Project) {
    e.preventDefault();
    e.stopPropagation();
    openProjectMenu({ x: e.clientX, y: e.clientY }, project);
  }

  function onProjectMenuButton(e: React.MouseEvent<HTMLButtonElement>, project: Project) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    openProjectMenu({ x: rect.left, y: rect.bottom }, project);
  }

  function onTaskContextMenu(e: React.MouseEvent, task: Task) {
    e.preventDefault();
    e.stopPropagation();
    openTaskMenu({ x: e.clientX, y: e.clientY }, task);
  }

  function onTaskMenuButton(e: React.MouseEvent<HTMLButtonElement>, task: Task) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    openTaskMenu({ x: rect.left, y: rect.bottom }, task);
  }

  async function deleteClientById(client: Client) {
    const projectCount = snapshot!.projects.filter((p) => p.clientId === client.id).length;
    if (!confirmDialog(`Excluir o cliente "${client.name}"? Os ${projectCount} projeto(s) dentro dele também serão apagados.`)) return;
    try {
      await invokeAction('client:delete', { clientId: client.id });
    } catch (err) {
      console.error('Erro ao apagar cliente:', err);
    }
  }

  function openClientMenu(pos: { x: number; y: number }, client: Client) {
    const items: ContextMenuItem[] = [
      {
        label: 'Apagar cliente',
        danger: true,
        onClick: async () => {
          setMenu(null); // Fecha o menu
          await deleteClientById(client);
        },
      },
    ];
    setMenu({ x: pos.x, y: pos.y, items });
  }

  function onClientMenuButton(e: React.MouseEvent<HTMLButtonElement>, client: Client) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    openClientMenu({ x: rect.left, y: rect.bottom }, client);
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
      <Titlebar title="CENTRAL DE TAREFAS · Cliente → Projeto → Tarefa → Subtarefa" />
      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1, overflow: 'hidden' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente ou projeto..."
          style={inputStyle}
        />

        <section className="allus-glass" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <FieldWithLabel label="Cliente" style={{ flex: 1 }}>
              <input value={clientField} onChange={(e) => setClientField(e.target.value)} placeholder="ex: Empresa X" style={inputStyle} />
            </FieldWithLabel>
            <FieldWithLabel label="Projeto" style={{ flex: 1 }}>
              <input value={projectField} onChange={(e) => setProjectField(e.target.value)} placeholder="ex: Site institucional" style={inputStyle} />
            </FieldWithLabel>
            <FieldWithLabel label="Tipo (opcional)" style={{ flex: 0.8 }}>
              <input value={typeField} onChange={(e) => setTypeField(e.target.value)} placeholder="ex: Web, Design" style={inputStyle} />
            </FieldWithLabel>
            <button style={pillButtonStyle} onClick={saveProject} disabled={savingProject}>
              {savingProject ? 'Salvando...' : 'Salvar projeto'}
            </button>
            {selectedProjectId && (
              <button
                style={pillButtonStyle}
                onClick={() => {
                  const project = snapshot!.projects.find((p) => p.id === selectedProjectId);
                  if (project) deleteProjectById(project);
                }}
              >
                🗑
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newTaskField}
              onChange={(e) => setNewTaskField(e.target.value)}
              placeholder="Nova tarefa neste projeto"
              style={{ ...inputStyle, flex: 1 }}
              disabled={!selectedProjectId}
            />
            <button style={pillButtonStyle} onClick={addTaskToSelected} disabled={!selectedProjectId || addingTask}>
              {addingTask ? 'Adicionando...' : 'Adicionar tarefa'}
            </button>
            <button style={pillButtonStyle} onClick={() => selectProjectForEdit(null)}>
              Novo projeto
            </button>
          </div>
          {clipboard && (
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>
              {clipboard.cut ? 'Recortado' : 'Copiado'}: "{clipboard.title}" — clique com o botão direito num projeto pra colar.{' '}
              <button style={{ ...iconGhostButtonStyle, textDecoration: 'underline' }} onClick={() => setClipboard(null)}>
                cancelar
              </button>
            </div>
          )}
        </section>

        <div style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>
          Clique com o botão direito (ou no "⋮") num cliente, projeto ou tarefa pra mais opções — copiar, mover,
          apagar e outras.
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--allus-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Clientes
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {grouped.map(({ client, projects }) => (
            <div key={client.id}>
              <div
                style={rowStyle}
                onClick={() => toggle(expandedClients, setExpandedClients, client.id)}
              >
                <span>{expandedClients.has(client.id) ? '▾' : '▸'}</span>
                <strong style={{ color: 'var(--allus-yellow-deep)' }}>{client.name}</strong>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--allus-text-muted)' }}>
                  {projects.length} projeto(s)
                </span>
                <button
                  className="allus-no-drag"
                  style={iconGhostButtonStyle}
                  onClick={(e) => onClientMenuButton(e, client)}
                  title="Mais opções"
                >
                  ⋮
                </button>
              </div>

              {expandedClients.has(client.id) &&
                projects.map((project) => (
                  <div key={project.id} style={{ marginLeft: 18 }}>
                    <div
                      style={rowStyle}
                      onClick={() => toggle(expandedProjects, setExpandedProjects, project.id)}
                      onContextMenu={(e) => onProjectContextMenu(e, project)}
                    >
                      <span>{expandedProjects.has(project.id) ? '▾' : '▸'}</span>
                      <span style={{ color: 'var(--allus-yellow)' }}>{project.name}</span>
                      {project.type && (
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--allus-text-muted)',
                            border: '1px solid var(--allus-glass-border)',
                            borderRadius: 999,
                            padding: '1px 8px',
                          }}
                        >
                          {project.type}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--allus-text-muted)' }}>
                        {topLevelTasks(project.id).length} tarefa(s)
                      </span>
                      <button
                        className="allus-no-drag"
                        style={iconGhostButtonStyle}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectProjectForEdit(project);
                        }}
                        title="Editar projeto"
                      >
                        ⚙
                      </button>
                      <button
                        className="allus-no-drag"
                        style={iconGhostButtonStyle}
                        onClick={(e) => onProjectMenuButton(e, project)}
                        title="Mais opções"
                      >
                        ⋮
                      </button>
                    </div>

                    {expandedProjects.has(project.id) &&
                      topLevelTasks(project.id).map((task) => (
                        <div key={task.id} style={{ marginLeft: 18 }}>
                          <TaskRow
                            task={task}
                            renaming={renaming}
                            setRenaming={setRenaming}
                            onToggleExpand={() => toggle(expandedTasks, setExpandedTasks, task.id)}
                            expanded={expandedTasks.has(task.id)}
                            subtaskCount={subtasksOf(task.id).length}
                            onContextMenu={(e) => onTaskContextMenu(e, task)}
                            onMenuButton={(e) => onTaskMenuButton(e, task)}
                          />
                          {expandedTasks.has(task.id) && (
                            <div style={{ marginLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {subtasksOf(task.id).map((sub) => (
                                <TaskRow
                                  key={sub.id}
                                  task={sub}
                                  renaming={renaming}
                                  setRenaming={setRenaming}
                                  onContextMenu={(e) => onTaskContextMenu(e, sub)}
                                  onMenuButton={(e) => onTaskMenuButton(e, sub)}
                                />
                              ))}
                              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                <input
                                  value={newSubtaskField[task.id] ?? ''}
                                  onChange={(e) => setNewSubtaskField({ ...newSubtaskField, [task.id]: e.target.value })}
                                  placeholder="Nova subtarefa"
                                  style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: 12 }}
                                />
                                <button
                                  style={pillButtonStyle}
                                  onClick={async () => {
                                    const title = newSubtaskField[task.id]?.trim();
                                    if (!title) return;
                                    await invokeAction('taskTree:add', { projectId: project.id, parentTaskId: task.id, title });
                                    setNewSubtaskField({ ...newSubtaskField, [task.id]: '' });
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      {moveTask && (
        <MoveToProjectModal
          task={moveTask}
          projects={snapshot.projects}
          clients={snapshot.clients}
          onClose={() => setMoveTask(null)}
        />
      )}

      {propsTask && (
        <PropertiesModal
          task={propsTask}
          projects={snapshot.projects}
          clients={snapshot.clients}
          profiles={snapshot.profiles}
          onClose={() => setPropsTask(null)}
        />
      )}

      <ToastHost />
    </div>
  );
}

function TaskRow({
  task,
  renaming,
  setRenaming,
  onToggleExpand,
  expanded,
  subtaskCount,
  onContextMenu,
  onMenuButton,
}: {
  task: Task;
  renaming: { id: string; value: string } | null;
  setRenaming: (v: { id: string; value: string } | null) => void;
  onToggleExpand?: () => void;
  expanded?: boolean;
  subtaskCount?: number;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMenuButton?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const isRenaming = renaming?.id === task.id;
  return (
    <div style={rowStyle} onContextMenu={onContextMenu}>
      {onToggleExpand && (
        <span onClick={onToggleExpand} style={{ cursor: 'pointer' }}>
          {expanded ? '▾' : '▸'}
        </span>
      )}
      <input
        type="checkbox"
        checked={task.isDone}
        onChange={() => invokeAction('taskTree:toggleDone', { taskId: task.id })}
      />
      {isRenaming ? (
        <>
          <input
            autoFocus
            value={renaming.value}
            onChange={(e) => setRenaming({ id: task.id, value: e.target.value })}
            style={{ ...inputStyle, padding: '2px 6px', fontSize: 12 }}
          />
          <button
            style={iconGhostButtonStyle}
            onClick={async () => {
              await invokeAction('taskTree:rename', { taskId: task.id, title: renaming.value });
              setRenaming(null);
            }}
          >
            ✓
          </button>
          <button style={iconGhostButtonStyle} onClick={() => setRenaming(null)}>✕</button>
        </>
      ) : (
        <span style={{ flex: 1, textDecoration: task.isDone ? 'line-through' : undefined }} onDoubleClick={() => setRenaming({ id: task.id, value: task.title })}>
          {task.title}
        </span>
      )}
      {subtaskCount !== undefined && subtaskCount > 0 && (
        <span style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>{subtaskCount} subtarefa(s)</span>
      )}
      <button
        style={iconGhostButtonStyle}
        onClick={() => invokeAction('task:focus', { taskId: task.id, subtaskId: null, title: task.title })}
      >
        Focar
      </button>
      {onMenuButton && (
        <button style={iconGhostButtonStyle} onClick={onMenuButton} title="Mais opções">
          ⋮
        </button>
      )}
    </div>
  );
}

function MoveToProjectModal({
  task,
  projects,
  clients,
  onClose,
}: {
  task: Task;
  projects: Project[];
  clients: Client[];
  onClose: () => void;
}) {
  async function move(project: Project) {
    await invokeAction('taskTree:move', { taskId: task.id, targetProjectId: project.id });
    onClose();
  }
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="allus-glass allus-no-drag" style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 13, marginBottom: 10 }}>Mover "{task.title}" para...</div>
        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {clients.map((client) => (
            <div key={client.id}>
              <div style={{ fontSize: 11, color: 'var(--allus-yellow-deep)', padding: '4px 8px' }}>{client.name}</div>
              {projects
                .filter((p) => p.clientId === client.id)
                .map((project) => (
                  <button key={project.id} onClick={() => move(project)} style={moveOptionStyle}>
                    {project.name}
                  </button>
                ))}
            </div>
          ))}
        </div>
        <button style={{ ...pillButtonStyle, marginTop: 10, width: '100%' }} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PropertiesModal({
  task,
  projects,
  clients,
  profiles,
  onClose,
}: {
  task: Task;
  projects: Project[];
  clients: Client[];
  profiles: TeamMember[];
  onClose: () => void;
}) {
  const project = projects.find((p) => p.id === task.projectId);
  const client = project ? clients.find((c) => c.id === project.clientId) : undefined;
  const author = profiles.find((p) => p.id === task.createdBy);
  const createdAt = new Date(task.createdAt).toLocaleString('pt-BR');

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div className="allus-glass allus-no-drag" style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Propriedades</div>
        <PropRow label="Título" value={task.title} />
        <PropRow label="Projeto" value={project?.name ?? '—'} />
        <PropRow label="Cliente" value={client?.name ?? '—'} />
        <PropRow label="Criado em" value={createdAt} />
        <PropRow label="Criado por" value={author?.fullName ?? 'Desconhecido'} />
        <button style={{ ...pillButtonStyle, marginTop: 10, width: '100%' }} onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function FieldWithLabel({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <span style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>{label}</span>
      {children}
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, padding: '4px 0' }}>
      <span style={{ color: 'var(--allus-text-muted)' }}>{label}</span>
      <span>{value}</span>
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

const pillButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid var(--allus-glass-border)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--allus-text-primary)',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const iconGhostButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--allus-text-muted)',
  fontSize: 12,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: Z.panel,
};

const modalStyle: React.CSSProperties = {
  width: 320,
  padding: 16,
};

const moveOptionStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 10px',
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: 'var(--allus-text-primary)',
  fontSize: 13,
};
