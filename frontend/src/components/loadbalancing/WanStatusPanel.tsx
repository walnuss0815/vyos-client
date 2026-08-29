import { useWANLoadBalanceStatus } from '../../hooks/useWANLoadBalanceStatus'

/** Live per-interface health-check status from `show wan-load-
 * balance` - op-mode data, refreshed via a manual button rather than
 * a timer (see useWANLoadBalanceStatus's own doc comment for why this
 * is deliberately "basic", not an auto-polling live view). */
export default function WanStatusPanel() {
  const query = useWANLoadBalanceStatus()

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
      {query.isError && <p className="text-xs text-danger-500">Failed to load WAN load-balancing status.</p>}
      {query.data && query.data.length === 0 && (
        <p className="text-xs text-slate-500">
          No health-check results yet - this appears shortly after the first check cycle completes.
        </p>
      )}
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-3">Interface</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Last change</th>
                <th className="py-1 pr-3">Failures</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((iface) => (
                <tr key={iface.interface} className="border-t border-surface-border text-slate-300">
                  <td className="py-1 pr-3 font-mono">{iface.interface}</td>
                  <td className={`py-1 pr-3 font-medium ${iface.active ? 'text-success-500' : 'text-danger-500'}`}>
                    {iface.active ? 'active' : 'failed'}
                  </td>
                  <td className="py-1 pr-3">{iface.lastStatusChange}</td>
                  <td className="py-1 pr-3">{iface.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
