interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 34,
          height: 20,
          borderRadius: 999,
          border: 'none',
          padding: 2,
          cursor: 'pointer',
          flexShrink: 0,
          background: checked ? 'var(--allus-yellow)' : 'rgba(255,255,255,0.14)',
          transition: 'background 0.2s ease',
        }}
      >
        <span
          style={{
            display: 'block',
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: checked ? '#000001' : 'var(--allus-text-primary)',
            transform: checked ? 'translateX(14px)' : 'translateX(0)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}
