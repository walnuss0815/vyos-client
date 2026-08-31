import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { broadcastRelayPath, parseBroadcastRelayConfig } from '../lib/serviceBroadcastRelayParse'
import { consoleServerPath, parseConsoleServerConfig } from '../lib/serviceConsoleServerParse'
import { parseDHCPRelayConfig, parseDHCPv6RelayConfig } from '../lib/serviceDhcpRelayParse'
import { dhcpv6ServerPath, parseDHCPv6ServerConfig } from '../lib/serviceDhcpv6ServerParse'
import { parseDynamicDNSConfig } from '../lib/serviceDnsDynamicParse'
import { dnsForwardingPath, parseDNSForwardingConfig } from '../lib/serviceDnsForwardingParse'
import { eventHandlerPath, parseEventHandlerConfig } from '../lib/serviceEventHandlerParse'
import { httpsPath, parseHTTPSConfig } from '../lib/serviceHttpsParse'
import { lldpPath, parseLLDPConfig } from '../lib/serviceLldpParse'
import { mdnsRepeaterPath, parseMdnsRepeaterConfig } from '../lib/serviceMdnsParse'
import {
  networkEventPath,
  parseMonitoringConfig,
  prometheusFrrExporterPath,
  prometheusNodeExporterPath,
  zabbixAgentPath,
} from '../lib/serviceMonitoringParse'
import { ndpProxyPath, parseNDPProxyConfig } from '../lib/serviceNdpProxyParse'
import { parseNTPConfig } from '../lib/serviceNtpParse'
import { parseRouterAdvertConfig } from '../lib/serviceRouterAdvertParse'
import { parseSNMPConfig, snmpPath } from '../lib/serviceSnmpParse'
import { parseSSHConfig, sshPath } from '../lib/serviceSshParse'
import { parseTFTPServerConfig, tftpServerPath } from '../lib/serviceTftpParse'
import { getConfigTree } from '../lib/vyosApi'
import { usePendingChangesStore, withPendingEnable } from '../store/pendingChanges'

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
 *
 * Most of these sub-areas are gated behind an "Enable X" button (a
 * `set <path>` with nothing under it yet) before their full settings
 * form is usable. Since the parsers above only see the last-fetched,
 * committed tree, clicking Enable wouldn't otherwise make the form
 * usable until a commit + refetch - withPendingEnable (see
 * store/pendingChanges.ts) closes that gap by also treating a
 * matching queued set/delete as enabling/disabling the feature
 * immediately. ntp/dhcpRelay/dhcpv6Relay/dnsDynamic/routerAdvert have
 * no such gate (always-editable forms/lists) and are left untouched.
 */
export function useServiceConfig() {
  const query = useQuery({
    queryKey: ['config-tree', 'service'],
    queryFn: () => getConfigTree(['service']),
  })

  const changes = usePendingChangesStore((s) => s.changes)
  const service = query.data?.data

  const ntp = useMemo(() => parseNTPConfig(child(service, 'ntp')), [service])
  const dhcpRelay = useMemo(() => parseDHCPRelayConfig(child(service, 'dhcp-relay')), [service])
  const dhcpv6Relay = useMemo(() => parseDHCPv6RelayConfig(child(service, 'dhcpv6-relay')), [service])
  const ssh = useMemo(
    () => withPendingEnable(parseSSHConfig(child(service, 'ssh')), sshPath(), changes),
    [service, changes],
  )
  const https = useMemo(
    () => withPendingEnable(parseHTTPSConfig(child(service, 'https')), httpsPath(), changes),
    [service, changes],
  )
  const dnsDynamic = useMemo(
    () => parseDynamicDNSConfig(child(child(service, 'dns'), 'dynamic')),
    [service],
  )
  const dnsForwarding = useMemo(
    () =>
      withPendingEnable(
        parseDNSForwardingConfig(child(child(service, 'dns'), 'forwarding')),
        dnsForwardingPath(),
        changes,
      ),
    [service, changes],
  )
  const routerAdvert = useMemo(
    () => parseRouterAdvertConfig(child(service, 'router-advert')),
    [service],
  )
  const dhcpv6Server = useMemo(
    () =>
      withPendingEnable(
        parseDHCPv6ServerConfig(child(service, 'dhcpv6-server')),
        dhcpv6ServerPath(),
        changes,
      ),
    [service, changes],
  )
  const snmp = useMemo(
    () => withPendingEnable(parseSNMPConfig(child(service, 'snmp')), snmpPath(), changes),
    [service, changes],
  )
  const tftp = useMemo(
    () =>
      withPendingEnable(parseTFTPServerConfig(child(service, 'tftp-server')), tftpServerPath(), changes),
    [service, changes],
  )
  const broadcastRelay = useMemo(
    () =>
      withPendingEnable(
        parseBroadcastRelayConfig(child(service, 'broadcast-relay')),
        broadcastRelayPath(),
        changes,
      ),
    [service, changes],
  )
  const mdnsRepeater = useMemo(
    () =>
      withPendingEnable(
        parseMdnsRepeaterConfig(child(child(service, 'mdns'), 'repeater')),
        mdnsRepeaterPath(),
        changes,
      ),
    [service, changes],
  )
  const lldp = useMemo(
    () => withPendingEnable(parseLLDPConfig(child(service, 'lldp')), lldpPath(), changes),
    [service, changes],
  )
  const ndpProxy = useMemo(
    () => withPendingEnable(parseNDPProxyConfig(child(service, 'ndp-proxy')), ndpProxyPath(), changes),
    [service, changes],
  )
  const eventHandler = useMemo(
    () =>
      withPendingEnable(
        parseEventHandlerConfig(child(service, 'event-handler')),
        eventHandlerPath(),
        changes,
      ),
    [service, changes],
  )
  const consoleServer = useMemo(
    () =>
      withPendingEnable(
        parseConsoleServerConfig(child(service, 'console-server')),
        consoleServerPath(),
        changes,
      ),
    [service, changes],
  )
  const monitoring = useMemo(() => {
    const parsed = parseMonitoringConfig(child(service, 'monitoring'))
    return {
      prometheusNodeExporter: withPendingEnable(
        parsed.prometheusNodeExporter,
        prometheusNodeExporterPath(),
        changes,
      ),
      prometheusFrrExporter: withPendingEnable(
        parsed.prometheusFrrExporter,
        prometheusFrrExporterPath(),
        changes,
      ),
      zabbixAgent: withPendingEnable(parsed.zabbixAgent, zabbixAgentPath(), changes),
      networkEvent: withPendingEnable(parsed.networkEvent, networkEventPath(), changes),
    }
  }, [service, changes])

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
