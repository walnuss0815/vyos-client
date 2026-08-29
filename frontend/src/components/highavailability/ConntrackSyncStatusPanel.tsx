import { useConntrackSyncStatus } from '../../hooks/useConntrackSyncStatus'

/** Live status from `show conntrack-sync status` - a fixed 4-line
 * text block (see the backend's ParseConntrackSyncStatus doc comment),
 * same manual-refresh "basic status" approach as the VRRP/
 * Load-balancing status panels. */
export default function ConntrackSyncStatusPanel() {
  const query = useConntrackSyncStatus()

  return (
    <div className="mb-6 rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Live status</p>
        <button
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="text-xs text-accent-500 hover:text-accent-400 disabled:opacity-50"
        >
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {query.isLoading && <p className="text-xs text-slate-400">Loading…</p>}
      {query.isError && <p className="text-xs text-danger-500">Failed to load conntrack-sync status.</p>}
      {query.data && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <dt className="text-slate-500">Sync interfaces</dt>
          <dd className="font-mono text-slate-300">{query.data.syncInterfaces.join(', ') || '—'}</dd>
          <dt className="text-slate-500">Failover mechanism</dt>
          <dd className="font-mono text-slate-300">
            {query.data.failoverMechanism} {query.data.syncGroup && `(sync-group ${query.data.syncGroup})`}
          </dd>
          <dt className="text-slate-500">Last state transition</dt>
          <dd className="text-slate-300">{query.data.lastTransition}</dd>
          <dt className="text-slate-500">Expectation sync</dt>
          <dd className="font-mono text-slate-300">
            {query.data.expectSyncProtocols.length > 0 ? query.data.expectSyncProtocols.join(', ') : 'disabled'}
          </dd>
        </dl>
      )}
    </div>
  )
}
