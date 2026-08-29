import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { parseBroadcastRelayConfig } from '../lib/serviceBroadcastRelayParse'
import { parseConsoleServerConfig } from '../lib/serviceConsoleServerParse'
import { parseDHCPRelayConfig, parseDHCPv6RelayConfig } from '../lib/serviceDhcpRelayParse'
import { parseDHCPv6ServerConfig } from '../lib/serviceDhcpv6ServerParse'
import { parseDynamicDNSConfig } from '../lib/serviceDnsDynamicParse'
import { parseDNSForwardingConfig } from '../lib/serviceDnsForwardingParse'
import { parseEventHandlerConfig } from '../lib/serviceEventHandlerParse'
import { parseHTTPSConfig } from '../lib/serviceHttpsParse'
import { parseLLDPConfig } from '../lib/serviceLldpParse'
import { parseMdnsRepeaterConfig } from '../lib/serviceMdnsParse'
import { parseMonitoringConfig } from '../lib/serviceMonitoringParse'
import { parseNDPProxyConfig } from '../lib/serviceNdpProxyParse'
import { parseNTPConfig } from '../lib/serviceNtpParse'
import { parseRouterAdvertConfig } from '../lib/serviceRouterAdvertParse'
import { parseSNMPConfig } from '../lib/serviceSnmpParse'
import { parseSSHConfig } from '../lib/serviceSshParse'
import { parseTFTPServerConfig } from '../lib/serviceTftpParse'
import { getConfigTree } from '../lib/vyosApi'

/**
 * Shared data source for every Service sub-area page (NTP, SSH, HTTPS
 * API, DHCP/DHCPv6 relay, DNS forwarding, Dynamic DNS, Router
 * Advertisements, DHCPv6 server, SNMP): fetches `service` once (query
 * key `['config-tree', 'service']`, matching the `['config-tree',
 * ...]` prefix PendingChangesBar invalidates after a commit - see
 * useSystemConfig.ts/useContainerConfig.ts for the identical
 * single-fetch pattern) and derives each area's typed shape from the
 * same raw tree. One fetch, many independently-testable parsers -
 * keeps every sub-area's own parse module simple and avoids 9 separate
 * network round-trips for what's really one config subtree.
 */
export function useServiceConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'service'],
    queryFn: () => getConfigTree(['service']),
  })

  const service = query.data?.data

  const ntp = useMemo(() => parseNTPConfig(child(service, 'ntp')), [service])
  const dhcpRelay = useMemo(() => parseDHCPRelayConfig(child(service, 'dhcp-relay')), [service])
  const dhcpv6Relay = useMemo(() => parseDHCPv6RelayConfig(child(service, 'dhcpv6-relay')), [service])
  const ssh = useMemo(() => parseSSHConfig(child(service, 'ssh')), [service])
  const https = useMemo(() => parseHTTPSConfig(child(service, 'https')), [service])
  const dnsDynamic = useMemo(
    () => parseDynamicDNSConfig(child(child(service, 'dns'), 'dynamic')),
    [service],
  )
  const dnsForwarding = useMemo(
    () => parseDNSForwardingConfig(child(child(service, 'dns'), 'forwarding')),
    [service],
  )
  const routerAdvert = useMemo(
    () => parseRouterAdvertConfig(child(service, 'router-advert')),
    [service],
  )
  const dhcpv6Server = useMemo(
    () => parseDHCPv6ServerConfig(child(service, 'dhcpv6-server')),
    [service],
  )
  const snmp = useMemo(() => parseSNMPConfig(child(service, 'snmp')), [service])
  const tftp = useMemo(() => parseTFTPServerConfig(child(service, 'tftp-server')), [service])
  const broadcastRelay = useMemo(
    () => parseBroadcastRelayConfig(child(service, 'broadcast-relay')),
    [service],
  )
  const mdnsRepeater = useMemo(
    () => parseMdnsRepeaterConfig(child(child(service, 'mdns'), 'repeater')),
    [service],
  )
  const lldp = useMemo(() => parseLLDPConfig(child(service, 'lldp')), [service])
  const ndpProxy = useMemo(() => parseNDPProxyConfig(child(service, 'ndp-proxy')), [service])
  const eventHandler = useMemo(
    () => parseEventHandlerConfig(child(service, 'event-handler')),
    [service],
  )
  const consoleServer = useMemo(
    () => parseConsoleServerConfig(child(service, 'console-server')),
    [service],
  )
  const monitoring = useMemo(
    () => parseMonitoringConfig(child(service, 'monitoring')),
    [service],
  )

  return {
    ...query,
    ntp,
    dhcpRelay,
    dhcpv6Relay,
    ssh,
    https,
    dnsDynamic,
    dnsForwarding,
    routerAdvert,
    dhcpv6Server,
    snmp,
    tftp,
    broadcastRelay,
    mdnsRepeater,
    lldp,
    ndpProxy,
    eventHandler,
    consoleServer,
    monitoring,
  }
}

function child(node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined
  return (node as Record<string, unknown>)[key]
}
