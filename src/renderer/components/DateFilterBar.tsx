import type { SessionDateFilter } from '../../shared/types';

const FILTERS: SessionDateFilter[] = ['Todas', 'Hoje', 'Ontem', 'Mês', '7 dias'];

interface DateFilterBarProps {
  value: SessionDateFilter;
  onChange: (value: SessionDateFilter) => void;
}

export function DateFilterBar({ value, onChange }: DateFilterBarProps) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          style={{
            ...pillButtonStyle,
            backgroundImage: value === f ? 'var(--allus-gradient)' : undefined,
            color: value === f ? '#000001' : undefined,
          }}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

const pillButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid var(--allus-glass-border)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--allus-text-primary)',
  fontSize: 12,
  whiteSpace: 'nowrap',
};
