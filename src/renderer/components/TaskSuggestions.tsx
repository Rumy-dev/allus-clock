import type { Client, Project, Task } from '../../shared/types';
import { displayPath } from '../../shared/types';
import { invokeAction } from '../invoke';
import { Z } from '../styles/zIndex';

interface TaskSuggestionsProps {
  query: string;
  tasks: Task[];
  projects: Project[];
  clients: Client[];
  onPick: () => void;
}

export function TaskSuggestions({ query, tasks, projects, clients, onPick }: TaskSuggestionsProps) {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return null;

  const matches = tasks
    .filter((t) => t.title.toLowerCase().includes(term))
    .slice(0, 5);

  if (matches.length === 0) return null;

  async function focus(task: Task) {
    await invokeAction('task:focus', { taskId: task.id, subtaskId: null, title: task.title });
    onPick();
  }

  return (
    <div className="allus-glass allus-no-drag" style={panelStyle}>
      <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', padding: '2px 8px 6px' }}>
        Já existe uma tarefa parecida — clique pra focar em vez de criar outra:
      </div>
      {matches.map((task) => {
        const project = projects.find((p) => p.id === task.projectId);
        const client = project ? clients.find((c) => c.id === project.clientId) : null;
        return (
          <button key={task.id} onClick={() => focus(task)} style={rowStyle}>
            <div style={{ fontSize: 13 }}>{task.title}</div>
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)' }}>
              {displayPath([client?.name, project?.name]) || 'Avulsa'}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: Z.dropdown,
  marginTop: 6,
  padding: 8,
  width: 320,
  maxHeight: 220,
  overflowY: 'auto',
};

const rowStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 10px',
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: 'var(--allus-text-primary)',
};
