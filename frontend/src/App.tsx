import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { commitDraft, fetchConfig, fetchInfo, login, saveRunningConfig } from './api';
import { ActionBar }  from './components/ActionBar';
import { ConfigTree } from './components/ConfigTree';
import { LoginForm }  from './components/LoginForm';
import { useAppStore } from './store';
import type { ConfigureCommand } from './types';

export default function App() {
  const {
    auth, setAuth,
    config, setConfig,
    draftOps, queueSet, queueDelete, resetDraft, markCommitted, isDirtyPath,
  } = useAppStore();

  const [notice, setNotice] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [theme,  setTheme]  = useState(
    document.documentElement.getAttribute('data-theme') || 'dark'
  );

  // ── Auth ──────────────────────────────────────────────────────────────────
  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      login(username, password),
    onSuccess: (result) => { setAuth(result); setError(null); setNotice('Signed in successfully.'); },
    onError:   (err: Error) => setError(err.message),
  });

  // ── Data ──────────────────────────────────────────────────────────────────
  const infoQuery = useQuery({
    queryKey: ['info', auth?.token],
    queryFn:  () => fetchInfo(auth!.token),
    enabled:  Boolean(auth?.token),
  });

  const configQuery = useQuery({
    queryKey: ['config', auth?.token],
    queryFn:  () => fetchConfig(auth!.token),
    enabled:  Boolean(auth?.token),
    staleTime: 0,
  });

  useMemo(() => {
    if (configQuery.data != null) setConfig(configQuery.data);
  }, [configQuery.data, setConfig]);

  // ── Build command list from draft ops ─────────────────────────────────────
  function buildCommands(): ConfigureCommand[] {
    return draftOps.map((op) => {
      if (op.type === 'delete') return { op: 'delete', path: op.path };
      return { op: 'set', path: op.value ? [...op.path, op.value] : op.path };
    });
  }

  // ── Commit ────────────────────────────────────────────────────────────────
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!auth?.token) throw new Error('Not authenticated.');
      return commitDraft(auth.token, buildCommands());
    },
    onSuccess: async () => {
      if (!auth?.token) return;
      const fresh = await fetchConfig(auth.token);
      markCommitted(fresh);
      setNotice('Commit successful.');
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!auth?.token) throw new Error('Not authenticated.');
      if (draftOps.length > 0) await commitDraft(auth.token, buildCommands());
      return saveRunningConfig(auth.token);
    },
    onSuccess: async () => {
      if (!auth?.token) return;
      const fresh = await fetchConfig(auth.token);
      markCommitted(fresh);
      setNotice('Configuration saved to disk.');
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  // ── Node actions ──────────────────────────────────────────────────────────
  function handleAddNode(path: string[]) {
    const nodeName = window.prompt('Node name:');
    if (!nodeName?.trim()) return;
    const nodeValue = window.prompt('Node value (leave empty to create a container node):');
    queueSet([...path, nodeName.trim()], nodeValue?.trim() || undefined);
    setNotice(`Node "${nodeName.trim()}" queued as draft.`);
  }

  function handleDeleteNode(path: string[]) {
    if (!window.confirm(`Delete node at path: ${path.join(' › ')}?`)) return;
    queueDelete(path);
    setNotice(`Node "${path[path.length - 1]}" queued for deletion.`);
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!auth) {
    return (
      <LoginForm
        onSubmit={(u, p) => loginMutation.mutateAsync({ username: u, password: p })}
        busy={loginMutation.isPending}
        error={error}
      />
    );
  }

  const busy = commitMutation.isPending || saveMutation.isPending || configQuery.isLoading;

  const infoText = infoQuery.data
    ? Object.entries(infoQuery.data).slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')
    : 'Loading VyOS information…';

  return (
    <div className="app-shell">
      <a href="#content" className="skip-link">Skip to content</a>

      <header className="topbar">
        <div>
          <p className="eyebrow">VyOS Configuration Client</p>
          <h1>Configuration Tree</h1>
          <p className="muted">{infoText}</p>
        </div>
        <div className="topbar-actions">
          <button
            className="btn btn-ghost"
            onClick={() => setTheme((window as any).__toggleTheme())}
            aria-label="Toggle color theme"
          >
            Theme: {theme}
          </button>
          <button className="btn btn-ghost" onClick={() => setAuth(null)}>
            Sign out
          </button>
        </div>
      </header>

      <main id="content" className="content-grid">
        <aside className="panel sidebar" aria-label="Session information">
          <section className="stack">
            <div>
              <p className="eyebrow">Status</p>
              <h2>Session</h2>
            </div>
            <div className="meta-list">
              <div><span>User</span><strong>{auth.user}</strong></div>
              <div><span>Pending nodes</span><strong>{draftOps.length}</strong></div>
              <div><span>Token valid</span><strong>{auth.expiresIn}</strong></div>
            </div>
          </section>

          <section className="stack">
            <div>
              <p className="eyebrow">How it works</p>
              <h2>Node model</h2>
            </div>
            <ul className="hint-list">
              <li>Only existing nodes are shown in the tree.</li>
              <li>New nodes are created locally as drafts first.</li>
              <li>Nodes in <em>italics</em> have uncommitted changes.</li>
              <li>Reset discards local drafts only — VyOS is not contacted.</li>
              <li>Commit sends all drafts to the running configuration.</li>
              <li>Save additionally persists the configuration to disk.</li>
            </ul>
          </section>

          {(notice || error) ? (
            <section className={`panel note${error ? ' note-error' : ''}`} role="status">
              <p>{error || notice}</p>
            </section>
          ) : null}
        </aside>

        <section className="panel workspace" aria-labelledby="tree-heading">
          <div className="workspace-head">
            <div>
              <p className="eyebrow">Tree view</p>
              <h2 id="tree-heading">Running configuration</h2>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => configQuery.refetch()}
              disabled={busy}
            >
              Reload
            </button>
          </div>

          {configQuery.isLoading ? (
            <div className="empty-state">
              <div className="empty-icon">…</div>
              <h2>Loading configuration</h2>
              <p>Fetching the current configuration from VyOS.</p>
            </div>
          ) : config ? (
            <ConfigTree
              value={config}
              isDirtyPath={isDirtyPath}
              onAddNode={handleAddNode}
              onDeleteNode={handleDeleteNode}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-icon">!</div>
              <h2>No data</h2>
              <p>The configuration could not be loaded yet.</p>
            </div>
          )}
        </section>
      </main>

      <ActionBar
        pendingCount={draftOps.length}
        busy={busy}
        onCommit={() => commitMutation.mutateAsync()}
        onSave={() => saveMutation.mutateAsync()}
        onReset={() => {
          resetDraft();
          setNotice('Local drafts have been reset.');
          setError(null);
        }}
      />
    </div>
  );
}
