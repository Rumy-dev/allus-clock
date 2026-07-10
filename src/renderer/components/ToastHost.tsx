import { useEffect, useState } from 'react';
import { subscribeToasts, type Toast } from '../toast';
import { Z } from '../styles/zIndex';

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="allus-no-drag"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        zIndex: Z.toast,
        maxWidth: '90%',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="allus-glass"
          style={{
            padding: '8px 14px',
            fontSize: 12,
            color: t.kind === 'error' ? 'var(--allus-status-interrompido)' : 'var(--allus-status-concluido)',
            border: `1px solid ${t.kind === 'error' ? 'rgba(255,107,107,0.4)' : 'rgba(126,242,155,0.4)'}`,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
