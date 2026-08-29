import { useVRRPStatus } from '../../hooks/useVRRPStatus'

const STATE_COLOR: Record<string, string> = {
  MASTER: 'text-success-500',
  BACKUP: 'text-accent-500',
  FAULT: 'text-danger-500',
  DISABLED: 'text-slate-500',
}

/** Live per-group VRRP state from `show vrrp` - same manual-refresh,
 * "basic status" approach as Load-balancing's status panels. */
export default function VrrpStatusPanel() {
  const query = useVRRPStatus()

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
      {query.isError && <p className="text-xs text-danger-500">Failed to load VRRP status.</p>}
      {query.data && query.data.length === 0 && <p className="text-xs text-slate-500">No VRRP groups reporting status.</p>}
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-3">Name</th>
                <th className="py-1 pr-3">Interface</th>
                <th className="py-1 pr-3">VRID</th>
                <th className="py-1 pr-3">State</th>
                <th className="py-1 pr-3">Priority</th>
                <th className="py-1 pr-3">Last transition</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((group) => (
                <tr key={`${group.name}-${group.interface}`} className="border-t border-surface-border text-slate-300">
                  <td className="py-1 pr-3 font-mono">{group.name}</td>
                  <td className="py-1 pr-3 font-mono">{group.interface}</td>
                  <td className="py-1 pr-3">{group.vrid}</td>
                  <td className={`py-1 pr-3 font-medium ${STATE_COLOR[group.state] ?? 'text-slate-300'}`}>{group.state}</td>
                  <td className="py-1 pr-3">{group.priority}</td>
                  <td className="py-1 pr-3">{group.lastTransition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
