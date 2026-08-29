import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseSharedNetworks } from '../lib/dhcpConfigParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for the DHCP Networks tab: fetches `service
 * dhcp-server` once (query key `['config-tree', 'service', 'dhcp-server']`,
 * matching the `['config-tree', ...]` prefix PendingChangesBar
 * invalidates after a commit) and derives the typed shared-network
 * list. Distinct from hooks/useDHCPLeases.ts, which fetches live
 * *operational* lease state under a different, never-commit-invalidated
 * query key - the Networks tab combines both (see
 * lib/dhcpPoolUtilization.ts) but each has its own hook, same as
 * Interfaces' useInterfaceConfig/useInterfaces split.
 */
export function useDHCPConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'service', 'dhcp-server'],
    queryFn: () => getConfigTree(['service', 'dhcp-server']),
  })

  const dhcpServer = query.data?.data

  const sharedNetworks = useMemo(() => parseSharedNetworks(dhcpServer), [dhcpServer])

  return { ...query, sharedNetworks }
}
