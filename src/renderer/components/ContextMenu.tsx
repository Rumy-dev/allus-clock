import { useEffect, useRef, useState } from 'react';
import { Z } from '../styles/zIndex';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      let adjustedX = x;
      let adjustedY = y;

      // Se sai pela direita, move pra esquerda
      if (rect.left + rect.width > window.innerWidth) {
        adjustedX = Math.max(8, window.innerWidth - rect.width - 8);
      }

      // Se sai por baixo, move pra cima
      if (rect.top + rect.height > window.innerHeight) {
        adjustedY = Math.max(8, window.innerHeight - rect.height - 8);
      }

      setAdjustedPos({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="allus-glass allus-no-drag"
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: Z.contextMenu,
        padding: 6,
        minWidth: 180,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          disabled={item.disabled}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          style={{
            textAlign: 'left',
            padding: '7px 10px',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: item.danger ? 'var(--allus-status-interrompido)' : 'var(--allus-text-primary)',
            fontSize: 13,
            opacity: item.disabled ? 0.4 : 1,
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
