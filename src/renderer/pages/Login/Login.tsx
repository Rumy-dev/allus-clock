import { useState } from 'react';
import allusFocusIcon from '../../assets/allus-focus-icon.svg';
import allusWatermark from '../../assets/allus-focus-watermark.svg';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await window.allus.invoke('auth:signIn', { email, password });
    setLoading(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div
      className="allus-app-bg allus-titlebar allus-watermark"
      style={
        {
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          '--allus-watermark-image': `url(${allusWatermark})`,
        } as React.CSSProperties
      }
    >
      <form
        onSubmit={handleSubmit}
        className="allus-glass allus-no-drag"
        style={{ width: 300, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <img
            src={allusFocusIcon}
            alt="Allus Focus"
            style={{ width: 48, height: 48, marginBottom: 8 }}
          />
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              backgroundImage: 'var(--allus-gradient)',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              letterSpacing: 1,
            }}
          >
            ALLUS FOCUS
          </div>
          <div style={{ fontSize: 12, color: 'var(--allus-text-secondary)', marginTop: 4 }}>
            Entre com sua conta do time
          </div>
        </div>

        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />

        {error && <div style={{ color: 'var(--allus-status-interrompido)', fontSize: 12 }}>{error}</div>}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--allus-glass-border)',
  borderRadius: 10,
  padding: '10px 12px',
  color: 'var(--allus-text-primary)',
  outline: 'none',
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 10,
  border: 'none',
  backgroundImage: 'var(--allus-gradient)',
  color: '#000001',
  fontWeight: 700,
  fontSize: 14,
};
