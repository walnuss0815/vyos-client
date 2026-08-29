import { useQuery } from '@tanstack/react-query'
import { getWANLoadBalanceStatus } from '../lib/vyosApi'

/** WAN failover's live per-interface health-check state (`show
 * wan-load-balance`) - op-mode data, so this deliberately doesn't use
 * the `['config-tree', ...]` query-key prefix PendingChangesBar
 * invalidates after a commit (there's nothing to commit here). No
 * auto-poll by default, unlike the Dashboard's charts - this is a
 * "basic" status view (per explicit scope decision), refreshed via
 * this query's own refetch() from a manual button rather than a timer.
 *
 * Previously lived in useLoadBalancingStatus.ts alongside
 * useHAProxyStatus (also moved to its own file) - split out so every
 * hook file in this directory exports exactly one hook matching its
 * filename, per the convention every other hook here already
 * follows. */
export function useWANLoadBalanceStatus() {
  return useQuery({
    queryKey: ['load-balancing-status', 'wan'],
    queryFn: getWANLoadBalanceStatus,
    select: (res) => res.interfaces,
  })
}
