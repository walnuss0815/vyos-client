import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { accelPppKindPath, parseAccelPppConfig } from '../lib/vpnAccelPppParse'
import { ipsecPath, parseIPsecConfig } from '../lib/vpnIpsecParse'
import { openconnectPath, parseOpenconnectConfig } from '../lib/vpnOpenconnectParse'
import { getConfigTree } from '../lib/vyosApi'
import { usePendingChangesStore, withPendingEnable } from '../store/pendingChanges'

/**
 * Shared data source for every VPN sub-area page (IPsec, L2TP, PPTP,
 * SSTP, OpenConnect): fetches `vpn` once (query key `['config-tree',
 * 'vpn']`, matching the `['config-tree', ...]` prefix
 * PendingChangesBar invalidates after a commit - see
 * useServiceConfig.ts for the identical single-fetch pattern) and
 * derives each area's typed shape from the same raw tree.
 *
 * All five sub-areas are gated behind an "Enable X" button - see
 * useServiceConfig.ts's doc comment for why withPendingEnable is
 * needed here too.
 */
export function useVpnConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'vpn'],
    queryFn: () => getConfigTree(['vpn']),
  })

  const changes = usePendingChangesStore((s) => s.changes)
  const vpn = query.data?.data

  const ipsec = useMemo(
    () => withPendingEnable(parseIPsecConfig(child(vpn, 'ipsec')), ipsecPath(), changes),
    [vpn, changes],
  )
  const l2tp = useMemo(
    () =>
      withPendingEnable(
        parseAccelPppConfig('l2tp', child(vpn, 'l2tp')),
        accelPppKindPath('l2tp'),
        changes,
      ),
    [vpn, changes],
  )
  const pptp = useMemo(
    () =>
      withPendingEnable(
        parseAccelPppConfig('pptp', child(vpn, 'pptp')),
        accelPppKindPath('pptp'),
        changes,
      ),
    [vpn, changes],
  )
  const sstp = useMemo(
    () =>
      withPendingEnable(
        parseAccelPppConfig('sstp', child(vpn, 'sstp')),
        accelPppKindPath('sstp'),
        changes,
      ),
    [vpn, changes],
  )
  const openconnect = useMemo(
    () =>
      withPendingEnable(
        parseOpenconnectConfig(child(vpn, 'openconnect')),
        openconnectPath(),
        changes,
      ),
    [vpn, changes],
  )

  return { ...query, ipsec, l2tp, pptp, sstp, openconnect }
}

function child(node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined
  return (node as Record<string, unknown>)[key]
}
