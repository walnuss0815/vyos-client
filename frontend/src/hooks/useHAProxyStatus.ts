import { useQuery } from '@tanstack/react-query'
import { getHAProxyStatus } from '../lib/vyosApi'

/** HAProxy's live frontend/backend/server status table (`show
 * load-balancing haproxy`) - same op-mode, manual-refresh shape as
 * useWANLoadBalanceStatus.ts's useWANLoadBalanceStatus.
 *
 * Previously lived in useLoadBalancingStatus.ts alongside
 * useWANLoadBalanceStatus (also moved to its own file) - split out so
 * every hook file in this directory exports exactly one hook matching
 * its filename, per the convention every other hook here already
 * follows. */
export function useHAProxyStatus() {
  return useQuery({
    queryKey: ['load-balancing-status', 'haproxy'],
    queryFn: getHAProxyStatus,
    select: (res) => res.rows,
  })
}
