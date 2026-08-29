import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parsePolicyConfig } from '../lib/policyParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the Policy pages (Prefix Lists, AS-Path
 * Lists, Community Lists, Route Maps, Local Route): fetches `policy`
 * once (query key `['config-tree', 'policy']`, matching the
 * `['config-tree', ...]` prefix PendingChangesBar invalidates after a
 * commit - see useBGPConfig.ts/useRoutingConfig.ts for the identical
 * single-fetch pattern) and derives the typed PolicyConfig shape.
 */
export function usePolicyConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'policy'],
    queryFn: () => getConfigTree(['policy']),
  })

  const policy = query.data?.data

  const config = useMemo(() => parsePolicyConfig(policy), [policy])

  return { ...query, ...config }
}
