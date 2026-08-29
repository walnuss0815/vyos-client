import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseAccelPppConfig } from '../lib/vpnAccelPppParse'
import { parseIPsecConfig } from '../lib/vpnIpsecParse'
import { parseOpenconnectConfig } from '../lib/vpnOpenconnectParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for every VPN sub-area page (IPsec, L2TP, PPTP,
 * SSTP, OpenConnect): fetches `vpn` once (query key `['config-tree',
 * 'vpn']`, matching the `['config-tree', ...]` prefix
 * PendingChangesBar invalidates after a commit - see
 * useServiceConfig.ts for the identical single-fetch pattern) and
 * derives each area's typed shape from the same raw tree.
 */
export function useVpnConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'vpn'],
    queryFn: () => getConfigTree(['vpn']),
  })

  const vpn = query.data?.data

  const ipsec = useMemo(() => parseIPsecConfig(child(vpn, 'ipsec')), [vpn])
  const l2tp = useMemo(() => parseAccelPppConfig('l2tp', child(vpn, 'l2tp')), [vpn])
  const pptp = useMemo(() => parseAccelPppConfig('pptp', child(vpn, 'pptp')), [vpn])
  const sstp = useMemo(() => parseAccelPppConfig('sstp', child(vpn, 'sstp')), [vpn])
  const openconnect = useMemo(() => parseOpenconnectConfig(child(vpn, 'openconnect')), [vpn])

  return { ...query, ipsec, l2tp, pptp, sstp, openconnect }
}

function child(node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined
  return (node as Record<string, unknown>)[key]
}
