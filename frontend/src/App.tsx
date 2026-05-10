import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { commitDraft, fetchConfig, fetchInfo, login, saveRunningConfig } from './api';
import { ActionBar } from './components/ActionBar';
import { ConfigTree } from './components/ConfigTree';
import { LoginForm } from './components/LoginForm';
import { useAppStore } from './store';
import type { ConfigureCommand } from './types';

function App() {
  const { auth, setAuth, config, setConfig, draftOps, queueSet, queueDelete, resetDraft, markCommitted, isDirtyPath } = useAppStore();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'dark');

  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => login(username, password),
    onSuccess: (result) => {
      setAuth(result);
      setError(null);
      setNotice('Anmeldung erfolgreich.');
    },
    onError: (err: Error) => setError(err.message)
  });

  const infoQuery = useQuery({
    queryKey: ['info', auth?.token],
    queryFn: () => fetchInfo(auth!.token),
    enabled: Boolean(auth?.token)
  });

  const configQuery = useQuery({
    queryKey: ['config', auth?.token],
    queryFn: () => fetchConfig(auth!.token),
    enabled: Boolean(auth?.token),
    staleTime: 0
  });

  useMemo(() => {
    if (configQuery.data) {
      setConfig(configQuery.data);
    }
  }, [configQuery.data, setConfig]);

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!auth?.token) throw new Error('Nicht authentifiziert.');
      const commands: ConfigureCommand[] = draftOps.map((op) => {
        if (op.type === 'delete') {
          return { op: 'delete', path: op.path };
        }
        return { op: 'set', path: op.value ? [...op.path, op.value] : op.path };
      });
      return commitDraft(auth.token, commands);
    },
    onSuccess: async () => {
      if (!auth?.token) return;
      const fresh = await fetchConfig(auth.token);
      markCommitted(fresh);
      setNotice('Commit erfolgreich durchgeführt.');
      setError(null);
    },
    onError: (err: Error) => setError(err.message)
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!auth?.token) throw new Error('Nicht authentifiziert.');
      if (draftOps.length > 0) {
        const commands: ConfigureCommand[] = draftOps.map((op) => {
          if (op.type === 'delete') {
            return { op: 'delete', path: op.path };
          }
          return { op: 'set', path: op.value ? [...op.path, op.value] : op.path };
        });
        await commitDraft(auth.token, commands);
      }
      return saveRunningConfig(auth.token);
    },
    onSuccess: async () => {
      if (!auth?.token) return;
      const fresh = await fetchConfig(auth.token);
      markCommitted(fresh);
      setNotice('Konfiguration wurde gespeichert.');
      setError(null);
    },
    onError: (err: Error) => setError(err.message)
  });

  async function handleLogin(username: string, password: string) {
    await loginMutation.mutateAsync({ username, password });
  }

  function openAddDialog(path: string[], mode: 'branch' | 'leaf') {
    const segment = window.prompt('Name des neuen Knotens');
    if (!segment) return;

    if (mode === 'branch') {
      queueSet([...path, segment]);
      setNotice(`Ast ${segment} als Draft angelegt.`);
      return;
    }

    const value = window.prompt('Optionaler Blattwert');
    queueSet([...path, segment], value ?? undefined);
    setNotice(`Blatt ${segment} als Draft angelegt.`);
  }

  function handleDelete(path: string[]) {
    if (!window.confirm(`Pfad ${path.join(' ')} wirklich löschen?`)) return;
    queueDelete(path);
    setNotice(`Pfad ${path.join(' ')} als Lösch-Draft markiert.`);
  }

  if (!auth) {
    return <LoginForm onSubmit={handleLogin} busy={loginMutation.isPending} error={error} />;
  }

  const busy = commitMutation.isPending || saveMutation.isPending || configQuery.isLoading;
  const infoText = infoQuery.data ? Object.entries(infoQuery.data).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') : 'VyOS-Informationen werden geladen…';

  return (
    <div className="app-shell">
      <a href="#content" className="skip-link">Zum Inhalt springen</a>
      <header className="topbar">
        <div>
          <p className="eyebrow">VyOS Configuration Client</p>
          <h1>Konfigurationsbaum</h1>
          <p className="muted">{infoText}</p>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => setTheme((window as any).__toggleTheme())}>Theme: {theme}</button>
          <button className="btn btn-ghost" onClick={() => setAuth(null)}>Logout</button>
        </div>
      </header>

      <main id="content" className="content-grid">
        <aside className="panel sidebar">
          <section className="stack">
            <div>
              <p className="eyebrow">Status</p>
              <h2>Arbeitskontext</h2>
            </div>
            <div className="meta-list">
              <div><span>Benutzer</span><strong>{auth.user}</strong></div>
              <div><span>Drafts</span><strong>{draftOps.length}</strong></div>
              <div><span>Session</span><strong>{auth.expiresIn}</strong></div>
            </div>
          </section>
          <section className="stack">
            <div>
              <p className="eyebrow">Best Practices</p>
              <h2>Bedienhinweise</h2>
            </div>
            <ul className="hint-list">
              <li>Nur vorhandene Äste werden dargestellt.</li>
              <li>Neue Knoten werden zunächst lokal als Draft geführt.</li>
              <li>Kursive Einträge sind verändert und noch nicht committed.</li>
              <li>Reset verwirft nur lokale Drafts.</li>
            </ul>
          </section>
          {(notice || error) ? (
            <section className={`panel note ${error ? 'note-error' : ''}`}>
              <p>{error || notice}</p>
            </section>
          ) : null}
        </aside>

        <section className="panel workspace">
          <div className="workspace-head">
            <div>
              <p className="eyebrow">Baumansicht</p>
              <h2>Laufende Konfiguration</h2>
            </div>
            <button className="btn btn-secondary" onClick={() => configQuery.refetch()} disabled={busy}>Neu laden</button>
          </div>

          {configQuery.isLoading ? (
            <div className="empty-state"><div className="empty-icon">…</div><h2>Konfiguration wird geladen</h2><p>Die Daten werden von VyOS abgefragt.</p></div>
          ) : config ? (
            <ConfigTree value={config} isDirtyPath={isDirtyPath} onAddNode={openAddDialog} onDeleteNode={handleDelete} />
          ) : (
            <div className="empty-state"><div className="empty-icon">!</div><h2>Keine Daten</h2><p>Es konnte noch keine Konfiguration geladen werden.</p></div>
          )}
        </section>
      </main>

      <ActionBar
        dirtyCount={draftOps.length}
        busy={busy}
        onCommit={async () => {
          await commitMutation.mutateAsync();
        }}
        onSave={async () => {
          await saveMutation.mutateAsync();
        }}
        onReset={() => {
          resetDraft();
          setNotice('Lokale Drafts wurden zurückgesetzt.');
          setError(null);
        }}
      />
    </div>
  );
}

export default App;
