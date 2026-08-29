import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseNATConfig } from '../lib/natParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the NAT pages (Source, Destination, Static):
 * fetches `nat` once (query key `['config-tree', 'nat']`, matching the
 * `['config-tree', ...]` prefix PendingChangesBar invalidates after a
 * commit - see useBGPConfig.ts/useRoutingConfig.ts for the identical
 * single-fetch pattern) and derives the typed NATConfig shape.
 */
export function useNATConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'nat'],
    queryFn: () => getConfigTree(['nat']),
  })

  const nat = query.data?.data

  const config = useMemo(() => parseNATConfig(nat), [nat])

  return { ...query, ...config }
}
