import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseContainerConfig } from '../lib/containerParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the Container pages (Containers, Networks,
 * Registries): fetches `container` once (query key `['config-tree',
 * 'container']`, matching the `['config-tree', ...]` prefix
 * PendingChangesBar invalidates after a commit - see
 * useSystemConfig.ts/useNATConfig.ts for the identical single-fetch
 * pattern) and derives the typed ContainerConfig shape.
 */
export function useContainerConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'container'],
    queryFn: () => getConfigTree(['container']),
  })

  const container = query.data?.data

  const config = useMemo(() => parseContainerConfig(container), [container])

  return { ...query, ...config }
}
