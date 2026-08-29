import { useHAProxyStatus } from '../../hooks/useHAProxyStatus'

const STATUS_COLOR: Record<string, string> = {
  UP: 'text-success-500',
  OPEN: 'text-success-500',
  DOWN: 'text-danger-500',
  MAINT: 'text-slate-400',
}

/** Live frontend/backend/server status table from `show
 * load-balancing haproxy` - same manual-refresh, "basic status"
 * approach as WanStatusPanel.tsx. */
export default function HaproxyStatusPanel() {
  const query = useHAProxyStatus()

  return (
    <div className="mb-8 rounded-xl border border-surface-border bg-surface-900 p-4">
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
      {query.isError && <p className="text-xs text-danger-500">Failed to load HAProxy status.</p>}
      {query.data && query.data.length === 0 && <p className="text-xs text-slate-500">No status data yet.</p>}
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-3">Proxy</th>
                <th className="py-1 pr-3">Role</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Req rate</th>
                <th className="py-1 pr-3">Resp time</th>
                <th className="py-1 pr-3">Last change</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((row, i) => (
                <tr key={`${row.proxyName}-${row.role}-${i}`} className="border-t border-surface-border text-slate-300">
                  <td className="py-1 pr-3 font-mono">{row.proxyName}</td>
                  <td className="py-1 pr-3 font-mono">{row.role}</td>
                  <td className={`py-1 pr-3 font-medium ${STATUS_COLOR[row.status] ?? 'text-slate-300'}`}>{row.status}</td>
                  <td className="py-1 pr-3">{row.reqRate}</td>
                  <td className="py-1 pr-3">{row.respTime}</td>
                  <td className="py-1 pr-3">{row.lastChange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
