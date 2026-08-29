import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseBGPConfig } from '../lib/bgpParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the BGP tab: fetches `protocols bgp` once
 * (query key `['config-tree', 'protocols', 'bgp']`, matching the
 * `['config-tree', ...]` prefix PendingChangesBar invalidates after a
 * commit - see useRoutingConfig.ts for the identical pattern used by
 * Static Routes) and derives the typed BGPConfig shape.
 */
export function useBGPConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'protocols', 'bgp'],
    queryFn: () => getConfigTree(['protocols', 'bgp']),
  })

  const protocolsBgp = query.data?.data

  const bgp = useMemo(() => parseBGPConfig(protocolsBgp), [protocolsBgp])

  return { ...query, bgp }
}
