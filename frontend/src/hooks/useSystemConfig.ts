import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseSystemConfig } from '../lib/systemParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the System pages (General, Users, Syslog):
 * fetches `system` once (query key `['config-tree', 'system']`,
 * matching the `['config-tree', ...]` prefix PendingChangesBar
 * invalidates after a commit - see useBGPConfig.ts/useRoutingConfig.ts
 * for the identical single-fetch pattern) and derives the typed
 * SystemConfig shape.
 */
export function useSystemConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'system'],
    queryFn: () => getConfigTree(['system']),
  })

  const system = query.data?.data

  const config = useMemo(() => parseSystemConfig(system), [system])

  return { ...query, ...config }
}
