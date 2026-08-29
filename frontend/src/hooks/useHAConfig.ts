import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseConntrackSyncConfig, parseHAConfig } from '../lib/haParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for both High Availability tabs (VRRP,
 * Conntrack-sync). Unlike Load-balancing's WAN/HAProxy (both under one
 * `load-balancing` config-tree root), VRRP and conntrack-sync are two
 * genuinely separate top-level trees (`high-availability` vs. `service
 * conntrack-sync`) - so this hook does two independent
 * `getConfigTree()` fetches (mirroring useInterfaceConfig()'s
 * `interfaces` + `vrf` two-fetch shape) rather than one. Both query
 * keys still share the `['config-tree', ...]` prefix
 * PendingChangesBar invalidates after a commit.
 */
export function useHAConfig() {
  const haQuery = useQuery({
    queryKey: ['config-tree', 'high-availability'],
    queryFn: () => getConfigTree(['high-availability']),
  })
  const conntrackSyncQuery = useQuery({
    queryKey: ['config-tree', 'service', 'conntrack-sync'],
    queryFn: () => getConfigTree(['service', 'conntrack-sync']),
  })

  const highAvailability = haQuery.data?.data
  const conntrackSync = conntrackSyncQuery.data?.data

  const ha = useMemo(() => parseHAConfig(highAvailability), [highAvailability])
  const conntrackSyncConfig = useMemo(() => parseConntrackSyncConfig(conntrackSync), [conntrackSync])

  return {
    ...ha,
    conntrackSync: conntrackSyncConfig,
    isLoading: haQuery.isLoading || conntrackSyncQuery.isLoading,
    isError: haQuery.isError || conntrackSyncQuery.isError,
    // Matching the fuller surface every single-fetch config hook
    // exposes for free by spreading its one `useQuery` result (see
    // e.g. useDHCPConfig.ts) - this hook fetches two trees, so it has
    // to combine these explicitly instead of a plain spread, but
    // callers shouldn't get a narrower hook just because of that.
    isFetching: haQuery.isFetching || conntrackSyncQuery.isFetching,
    error: haQuery.error ?? conntrackSyncQuery.error,
    refetch: () => Promise.all([haQuery.refetch(), conntrackSyncQuery.refetch()]),
  }
}
