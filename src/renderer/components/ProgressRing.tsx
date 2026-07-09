interface ProgressRingProps {
  progress: number; // 0..1
  size?: number;
  label: string;
  sublabel: string;
}

export function ProgressRing({ progress, size = 220, label, sublabel }: ProgressRingProps) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="allus-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--allus-yellow-deep)" />
            <stop offset="55%" stopColor="var(--allus-yellow)" />
            <stop offset="100%" stopColor="var(--allus-yellow-soft)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#allus-ring-gradient)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.3s linear' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <div style={{ fontFamily: 'var(--allus-font-mono)', fontSize: size * 0.16, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 12, letterSpacing: 2, color: 'var(--allus-text-secondary)' }}>{sublabel}</div>
      </div>
    </div>
  );
}
