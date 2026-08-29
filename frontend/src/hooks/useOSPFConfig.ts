import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseOSPFConfig } from '../lib/ospfParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the OSPF tab: OSPFv2 and OSPFv3 are separate
 * FRR processes with separate top-level config nodes (`protocols
 * ospf` / `protocols ospfv3` - see ospfTypes.ts's doc comment), so
 * this fetches both independently (query keys `['config-tree',
 * 'protocols', 'ospf']` / `['config-tree', 'protocols', 'ospfv3']`,
 * matching the `['config-tree', ...]` prefix PendingChangesBar
 * invalidates after a commit - see useBGPConfig.ts/useRoutingConfig.ts
 * for the identical single-fetch pattern this extends to two) and
 * combines them into one typed OSPFConfig.
 */
export function useOSPFConfig() {
  const ospfQuery = useQuery({
    queryKey: ['config-tree', 'protocols', 'ospf'],
    queryFn: () => getConfigTree(['protocols', 'ospf']),
  })
  const ospfv3Query = useQuery({
    queryKey: ['config-tree', 'protocols', 'ospfv3'],
    queryFn: () => getConfigTree(['protocols', 'ospfv3']),
  })

  const ospfData = ospfQuery.data?.data
  const ospfv3Data = ospfv3Query.data?.data

  const config = useMemo(() => parseOSPFConfig(ospfData, ospfv3Data), [ospfData, ospfv3Data])

  return {
    ospf: config.ospf,
    ospfv3: config.ospfv3,
    isLoading: ospfQuery.isLoading || ospfv3Query.isLoading,
    isError: ospfQuery.isError || ospfv3Query.isError,
    // Matching the fuller surface every single-fetch config hook
    // exposes for free by spreading its one `useQuery` result (see
    // e.g. useDHCPConfig.ts) - this hook fetches two trees, so it has
    // to combine these explicitly instead of a plain spread, but
    // callers shouldn't get a narrower hook just because of that.
    isFetching: ospfQuery.isFetching || ospfv3Query.isFetching,
    error: ospfQuery.error ?? ospfv3Query.error,
    refetch: () => Promise.all([ospfQuery.refetch(), ospfv3Query.refetch()]),
  }
}
