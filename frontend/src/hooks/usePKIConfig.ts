import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parsePKIConfig } from '../lib/pkiParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the PKI pages (CAs, Certificates, Key
 * Material, Defaults): fetches `pki` once (query key
 * `['config-tree', 'pki']`, matching the `['config-tree', ...]`
 * prefix PendingChangesBar invalidates after a commit - see
 * useBGPConfig.ts/useRoutingConfig.ts for the identical single-fetch
 * pattern) and derives the typed PKIConfig shape.
 */
export function usePKIConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'pki'],
    queryFn: () => getConfigTree(['pki']),
  })

  const pki = query.data?.data

  const config = useMemo(() => parsePKIConfig(pki), [pki])

  return { ...query, ...config }
}
