import type { Ref } from 'react';
import { createPortal } from 'react-dom';
import { POMO_MODES } from '../../shared/types';
import type { PomoMode, PomoTaskLog } from '../../shared/types';
import { invokeAction } from '../invoke';
import { Z } from '../styles/zIndex';

interface TaskModeSelectorProps {
  task: { taskId: string | null; title: string };
  recentTasks: PomoTaskLog[];
  onSelectTask: (task: { taskId: string | null; title: string }) => void;
  onClose: () => void;
  cardRef?: Ref<HTMLDivElement>;
}

export function TaskModeSelector({ task, recentTasks, onSelectTask, onClose, cardRef }: TaskModeSelectorProps) {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: Z.popover,
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        style={{
          background: 'var(--allus-surface)',
          borderRadius: 12,
          padding: 20,
          maxWidth: 320,
          maxHeight: 640,
          boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
          overflowY: 'auto',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!task.taskId ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 'var(--allus-space-4)', color: 'var(--allus-text-primary)' }}>
              Escolha a tarefa
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--allus-space-2)', marginBottom: 'var(--allus-space-4)', paddingBottom: 'var(--allus-space-4)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              {recentTasks.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--allus-text-muted)' }}>Nenhuma tarefa recente ainda.</div>
              ) : (
                recentTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTask({ taskId: t.taskId, title: t.taskTitle })}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--allus-text-primary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      fontWeight: 500,
                      pointerEvents: 'auto',
                    }}
                  >
                    {t.taskTitle}
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 'var(--allus-space-4)', color: 'var(--allus-text-primary)', paddingBottom: 'var(--allus-space-3)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {task.title}
          </div>
        )}

        {task.taskId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ fontSize: 11, color: 'var(--allus-text-muted)', fontWeight: 600, marginBottom: 4 }}>
              Tipo de ciclo:
            </div>
            {(Object.keys(POMO_MODES) as PomoMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  invokeAction('timer:setMode', { mode }).catch(console.error);
                  invokeAction('task:focus', {
                    taskId: task.taskId,
                    subtaskId: null,
                    title: task.title,
                  }).catch(console.error);
                  onClose();
                }}
                style={{
                  padding: '11px 13px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--allus-text-primary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  fontWeight: 500,
                  pointerEvents: 'auto',
                }}
              >
                {POMO_MODES[mode].title} • {POMO_MODES[mode].focusSeconds / 60}m foco
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
