import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseLoadBalancingConfig } from '../lib/loadBalancingParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for both Load-balancing tabs (WAN, HAProxy):
 * fetches `load-balancing` once (query key `['config-tree',
 * 'load-balancing']`, matching the `['config-tree', ...]` prefix
 * PendingChangesBar invalidates after a commit) and derives the typed
 * `wan`/`haproxy` views - same "one fetch, several derived views"
 * shape as useFirewallConfig()/usePKIConfig()/useContainerConfig().
 * Unlike Container's Images tab, both WAN and HAProxy here are
 * ordinary `/configure`-tree data (not op-mode), so there's no need
 * for a separate hook per tab the way ImagesPage.tsx needed one.
 */
export function useLoadBalancingConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'load-balancing'],
    queryFn: () => getConfigTree(['load-balancing']),
  })

  const loadBalancing = query.data?.data

  const derived = useMemo(() => parseLoadBalancingConfig(loadBalancing), [loadBalancing])

  return { ...query, ...derived }
}
