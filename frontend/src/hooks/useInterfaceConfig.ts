import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  parseBondInterfaces,
  parseBridgeInterfaces,
  parseEthernetInterfaces,
  parseVrfs,
} from '../lib/interfaceParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the interface config pages (Ethernet,
 * Bonding, Bridge, VRFs): fetches `interfaces` and `vrf` (separate
 * config-tree roots, so separate queries) once each - query keys
 * `['config-tree', 'interfaces']` / `['config-tree', 'vrf']`, matching
 * the `['config-tree', ...]` prefix PendingChangesBar invalidates
 * after a commit - and derives the typed views each page needs.
 *
 * This is distinct from hooks/useInterfaces.ts, which fetches live
 * *operational* interface state (`GET /api/interfaces`, a different
 * query key entirely, never invalidated by a commit) - see that file's
 * doc comment. Interface config pages generally need both: this hook
 * for what's configured, useInterfaces for which physical interfaces
 * actually exist on the router.
 */
export function useInterfaceConfig() {
  const interfacesQuery = useQuery({
    queryKey: ['config-tree', 'interfaces'],
    queryFn: () => getConfigTree(['interfaces']),
  })
  const vrfQuery = useQuery({
    queryKey: ['config-tree', 'vrf'],
    queryFn: () => getConfigTree(['vrf']),
  })

  const interfaces = interfacesQuery.data?.data
  const vrf = vrfQuery.data?.data

  // React Query returns a stable `data` reference across re-renders
  // when the underlying data hasn't actually changed (structural
  // sharing), so keying on `interfaces`/`vrf` here means these parse
  // passes only re-run when the fetched config actually changes.
  const derived = useMemo(
    () => ({
      ethernetInterfaces: parseEthernetInterfaces(interfaces),
      bondInterfaces: parseBondInterfaces(interfaces),
      bridgeInterfaces: parseBridgeInterfaces(interfaces),
      vrfs: parseVrfs(vrf),
    }),
    [interfaces, vrf],
  )

  return {
    ...derived,
    isLoading: interfacesQuery.isLoading || vrfQuery.isLoading,
    isError: interfacesQuery.isError || vrfQuery.isError,
    // Matching the fuller surface every single-fetch config hook
    // exposes for free by spreading its one `useQuery` result (see
    // e.g. useDHCPConfig.ts) - this hook fetches two trees, so it has
    // to combine these explicitly instead of a plain spread, but
    // callers shouldn't get a narrower hook just because of that.
    isFetching: interfacesQuery.isFetching || vrfQuery.isFetching,
    error: interfacesQuery.error ?? vrfQuery.error,
    refetch: () => Promise.all([interfacesQuery.refetch(), vrfQuery.refetch()]),
  }
}
