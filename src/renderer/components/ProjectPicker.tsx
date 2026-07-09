import type { Ref } from 'react';
import { createPortal } from 'react-dom';
import type { Client, Project } from '../../shared/types';
import { invokeAction } from '../invoke';

interface ProjectPickerProps {
  clients: Client[];
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  panelRef?: Ref<HTMLDivElement>;
}

export function ProjectPicker({ clients, projects, selectedProjectId, onSelect, panelRef }: ProjectPickerProps) {
  async function pick(projectId: string) {
    await invokeAction('project:select', { projectId });
    onSelect(projectId);
  }

  function close() {
    onSelect(selectedProjectId ?? '');
  }

  const groups = clients
    .map((client) => ({ client, clientProjects: projects.filter((p) => p.clientId === client.id) }))
    .filter((g) => g.clientProjects.length > 0);

  return createPortal(
    <div style={overlayStyle} onClick={close}>
      <div ref={panelRef} className="allus-no-drag" style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--allus-space-4)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--allus-text-primary)' }}>Selecione o projeto</div>
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', marginTop: 2 }}>
              Novas tarefas vão para o projeto selecionado.
            </div>
          </div>
          <button
            onClick={close}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--allus-text-muted)',
              fontSize: 14,
              cursor: 'pointer',
              padding: 2,
              lineHeight: 1,
            }}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {groups.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--allus-text-muted)', padding: 'var(--allus-space-2)' }}>
            Nenhum cliente/projeto ainda.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-3)' }}>
            {groups.map(({ client, clientProjects }) => (
              <div
                key={client.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  padding: 'var(--allus-space-2)',
                }}
              >
                <div style={clientHeadingStyle}>{client.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {clientProjects.map((project) => {
                    const active = selectedProjectId === project.id;
                    return (
                      <button
                        key={project.id}
                        onClick={() => pick(project.id)}
                        style={{
                          ...projectButtonStyle,
                          background: active ? 'var(--allus-gradient)' : 'rgba(255,255,255,0.04)',
                          color: active ? '#000001' : 'var(--allus-text-primary)',
                          fontWeight: active ? 600 : 500,
                        }}
                        onMouseEnter={(e) => {
                          if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
                        }}
                        onMouseLeave={(e) => {
                          if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                        }}
                      >
                        {project.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 999,
  backdropFilter: 'blur(2px)',
};

const panelStyle: React.CSSProperties = {
  background: 'var(--allus-surface)',
  borderRadius: 12,
  padding: 20,
  minWidth: 260,
  maxWidth: 320,
  maxHeight: 480,
  boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
  overflowY: 'auto',
};

const clientHeadingStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--allus-yellow-deep)',
  padding: '2px 4px',
};

const projectButtonStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  borderRadius: 8,
  border: 'none',
  fontSize: 13,
  cursor: 'pointer',
  transition: 'background 0.15s ease',
};
