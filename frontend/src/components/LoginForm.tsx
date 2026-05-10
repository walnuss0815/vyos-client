import { useState } from 'react';

type Props = {
  onSubmit: (username: string, password: string) => Promise<void>;
  busy: boolean;
  error: string | null;
};

export function LoginForm({ onSubmit, busy, error }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 80 80" role="img">
            <path d="M14 50 40 12l26 38-26 18Z" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
            <path d="M40 12v56" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="eyebrow">VyOS Configuration Client</p>
          <h1 id="login-title">Anmelden</h1>
          <p className="muted">App-interne Anmeldung, VyOS-API-Zugriff nur über den gesicherten Backend-Proxy.</p>
        </div>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit(username, password);
          }}
        >
          <label className="field">
            <span>Benutzername</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label className="field">
            <span>Passwort</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Anmeldung läuft…' : 'Anmelden'}
          </button>
        </form>
      </section>
    </main>
  );
}
