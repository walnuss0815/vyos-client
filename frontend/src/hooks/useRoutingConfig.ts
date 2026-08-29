import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseStaticRoutes } from '../lib/routingParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the Static Routes tab: fetches `protocols
 * static` once (query key `['config-tree', 'protocols', 'static']`,
 * matching the `['config-tree', ...]` prefix PendingChangesBar
 * invalidates after a commit) and derives the typed route list. Only
 * `static` under `protocols` - dynamic routing protocols (BGP, OSPF,
 * ...) aren't modeled here, see docs/roadmap.md.
 */
export function useRoutingConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'protocols', 'static'],
    queryFn: () => getConfigTree(['protocols', 'static']),
  })

  const protocolsStatic = query.data?.data

  const staticRoutes = useMemo(() => parseStaticRoutes(protocolsStatic), [protocolsStatic])

  return { ...query, staticRoutes }
}
