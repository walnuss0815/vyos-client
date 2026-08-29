import {
  blankMonitoringConfig,
  blankNetworkEventConfig,
  blankPrometheusFrrExporterConfig,
  blankPrometheusNodeExporterConfig,
  blankZabbixAgentConfig,
  type MonitoringConfig,
  type NetworkEventConfig,
  type PrometheusFrrExporterConfig,
  type PrometheusNodeExporterConfig,
  type ZabbixAgentConfig,
  type ZabbixServerActive,
} from './serviceMonitoringTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/containerParse.ts's
// own copy of this comment for why this matches the rest of the codebase.)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') return [v]
  return []
}

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

function parseNodeExporter(prometheus: unknown): PrometheusNodeExporterConfig {
  const root = child(prometheus, 'node-exporter')
  if (root === undefined) return blankPrometheusNodeExporterConfig()
  return {
    enabled: true,
    listenAddresses: asStringArray(child(root, 'listen-address')),
    port: asString(child(root, 'port')),
    vrf: asString(child(root, 'vrf')),
    collectTextfile: isFlagPresent(child(root, 'collectors'), 'textfile'),
  }
}

function parseFrrExporter(prometheus: unknown): PrometheusFrrExporterConfig {
  const root = child(prometheus, 'frr-exporter')
  if (root === undefined) return blankPrometheusFrrExporterConfig()
  const collector = child(root, 'collector')
  const bgp = child(collector, 'bgp')
  return {
    enabled: true,
    listenAddresses: asStringArray(child(root, 'listen-address')),
    port: asString(child(root, 'port')),
    vrf: asString(child(root, 'vrf')),
    collectBgpAcceptFilteredPrefixes: isFlagPresent(bgp, 'accept-filtered-prefixes'),
    collectBgpAdvertisedPrefixes: isFlagPresent(bgp, 'advertised-prefixes'),
    collectBgpPeerDescription: asString(child(bgp, 'peer-description')),
    collectBgpPeerGroup: isFlagPresent(bgp, 'peer-group'),
    collectBgpPeerHostname: isFlagPresent(bgp, 'peer-hostname'),
    collectBgpPeerType: isFlagPresent(bgp, 'peer-type'),
    collectBgpL2Vpn: isFlagPresent(collector, 'bgp-l2-vpn'),
    collectOspfInstances: asStringArray(child(collector, 'ospf-instance')),
    collectPim: isFlagPresent(collector, 'pim'),
    collectDetailedRoutes: isFlagPresent(collector, 'detailed-routes'),
  }
}

function parseZabbixServerActive(address: string, raw: unknown): ZabbixServerActive {
  return { address, port: asString(child(raw, 'port')) }
}

function parseZabbixAgent(zabbix: unknown): ZabbixAgentConfig {
  if (zabbix === undefined) return blankZabbixAgentConfig()
  const auth = child(zabbix, 'authentication')
  const psk = child(auth, 'psk')
  const limits = child(zabbix, 'limits')
  const log = child(zabbix, 'log')
  return {
    enabled: true,
    authMode: asString(child(auth, 'mode')),
    pskId: asString(child(psk, 'id')),
    hasPskSecret: child(psk, 'secret') !== undefined,
    directory: asString(child(zabbix, 'directory')),
    hostName: asString(child(zabbix, 'host-name')),
    bufferFlushInterval: asString(child(limits, 'buffer-flush-interval')),
    bufferSize: asString(child(limits, 'buffer-size')),
    debugLevel: asString(child(log, 'debug-level')),
    logRemoteCommands: isFlagPresent(log, 'remote-commands'),
    logSize: asString(child(log, 'size')),
    listenAddresses: asStringArray(child(zabbix, 'listen-address')),
    port: asString(child(zabbix, 'port')),
    servers: asStringArray(child(zabbix, 'server')),
    serverActive: entries(child(zabbix, 'server-active'))
      .map(([address, raw]) => parseZabbixServerActive(address, raw))
      .sort((a, b) => a.address.localeCompare(b.address)),
    timeout: asString(child(zabbix, 'timeout')),
    vrf: asString(child(zabbix, 'vrf')),
  }
}

function parseNetworkEvent(networkEvent: unknown): NetworkEventConfig {
  if (networkEvent === undefined) return blankNetworkEventConfig()
  const event = child(networkEvent, 'event')
  return {
    enabled: true,
    eventRoute: isFlagPresent(event, 'route'),
    eventLink: isFlagPresent(event, 'link'),
    eventAddr: isFlagPresent(event, 'addr'),
    eventNeigh: isFlagPresent(event, 'neigh'),
    eventRule: isFlagPresent(event, 'rule'),
    queueSize: asString(child(networkEvent, 'queue-size')),
    logLevel: asString(child(networkEvent, 'log-level')),
  }
}

export function parseMonitoringConfig(monitoring: unknown): MonitoringConfig {
  if (monitoring === undefined) return blankMonitoringConfig()
  const prometheus = child(monitoring, 'prometheus')
  return {
    prometheusNodeExporter: parseNodeExporter(prometheus),
    prometheusFrrExporter: parseFrrExporter(prometheus),
    zabbixAgent: parseZabbixAgent(child(monitoring, 'zabbix-agent')),
    networkEvent: parseNetworkEvent(child(monitoring, 'network-event')),
  }
}

// --- path builders -----------------------------------------------------

export function monitoringPath(...rest: string[]): string[] {
  return ['service', 'monitoring', ...rest]
}

export function prometheusNodeExporterPath(...rest: string[]): string[] {
  return monitoringPath('prometheus', 'node-exporter', ...rest)
}

export function prometheusFrrExporterPath(...rest: string[]): string[] {
  return monitoringPath('prometheus', 'frr-exporter', ...rest)
}

export function zabbixAgentPath(...rest: string[]): string[] {
  return monitoringPath('zabbix-agent', ...rest)
}

export function zabbixServerActivePath(address: string, ...rest: string[]): string[] {
  return zabbixAgentPath('server-active', address, ...rest)
}

export function networkEventPath(...rest: string[]): string[] {
  return monitoringPath('network-event', ...rest)
}
