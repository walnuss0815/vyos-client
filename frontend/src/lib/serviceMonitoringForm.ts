import {
  networkEventPath,
  prometheusFrrExporterPath,
  prometheusNodeExporterPath,
  zabbixAgentPath,
  zabbixServerActivePath,
} from './serviceMonitoringParse'
import type { NetworkEventConfig, PrometheusFrrExporterConfig, PrometheusNodeExporterConfig, ZabbixAgentConfig } from './serviceMonitoringTypes'
import type { ConfigOp } from './vyosApi'

// --- Prometheus node-exporter ----------------------------------------------

export interface NodeExporterFormValues {
  port: string
  vrf: string
  collectTextfile: boolean
}

export function blankNodeExporterFormValues(): NodeExporterFormValues {
  return { port: '', vrf: '', collectTextfile: false }
}

export function nodeExporterConfigToFormValues(config: PrometheusNodeExporterConfig): NodeExporterFormValues {
  return { port: config.port ?? '', vrf: config.vrf ?? '', collectTextfile: config.collectTextfile }
}

export function nodeExporterFormToOps(
  before: PrometheusNodeExporterConfig,
  values: NodeExporterFormValues,
): ConfigOp[] {
  const beforeValues = nodeExporterConfigToFormValues(before)
  const ops: ConfigOp[] = []
  const base = prometheusNodeExporterPath()

  if (beforeValues.collectTextfile !== values.collectTextfile) {
    const path = [...base, 'collectors', 'textfile']
    ops.push(values.collectTextfile ? { op: 'set', path } : { op: 'delete', path })
  }
  for (const field of [
    { get: (v: NodeExporterFormValues) => v.port, segment: 'port' },
    { get: (v: NodeExporterFormValues) => v.vrf, segment: 'vrf' },
  ]) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function enableNodeExporterOp(): ConfigOp {
  return { op: 'set', path: prometheusNodeExporterPath() }
}

export function disableNodeExporterOp(): ConfigOp {
  return { op: 'delete', path: prometheusNodeExporterPath() }
}

// --- Prometheus frr-exporter -------------------------------------------

export interface FrrExporterFormValues {
  port: string
  vrf: string
  collectBgpAcceptFilteredPrefixes: boolean
  collectBgpAdvertisedPrefixes: boolean
  collectBgpPeerDescription: string
  collectBgpPeerGroup: boolean
  collectBgpPeerHostname: boolean
  collectBgpPeerType: boolean
  collectBgpL2Vpn: boolean
  collectPim: boolean
  collectDetailedRoutes: boolean
}

export function blankFrrExporterFormValues(): FrrExporterFormValues {
  return {
    port: '',
    vrf: '',
    collectBgpAcceptFilteredPrefixes: false,
    collectBgpAdvertisedPrefixes: false,
    collectBgpPeerDescription: '',
    collectBgpPeerGroup: false,
    collectBgpPeerHostname: false,
    collectBgpPeerType: false,
    collectBgpL2Vpn: false,
    collectPim: false,
    collectDetailedRoutes: false,
  }
}

export function frrExporterConfigToFormValues(config: PrometheusFrrExporterConfig): FrrExporterFormValues {
  return {
    port: config.port ?? '',
    vrf: config.vrf ?? '',
    collectBgpAcceptFilteredPrefixes: config.collectBgpAcceptFilteredPrefixes,
    collectBgpAdvertisedPrefixes: config.collectBgpAdvertisedPrefixes,
    collectBgpPeerDescription: config.collectBgpPeerDescription ?? '',
    collectBgpPeerGroup: config.collectBgpPeerGroup,
    collectBgpPeerHostname: config.collectBgpPeerHostname,
    collectBgpPeerType: config.collectBgpPeerType,
    collectBgpL2Vpn: config.collectBgpL2Vpn,
    collectPim: config.collectPim,
    collectDetailedRoutes: config.collectDetailedRoutes,
  }
}

const FRR_FLAG_FIELDS: { get: (v: FrrExporterFormValues) => boolean; segments: string[] }[] = [
  { get: (v) => v.collectBgpAcceptFilteredPrefixes, segments: ['collector', 'bgp', 'accept-filtered-prefixes'] },
  { get: (v) => v.collectBgpAdvertisedPrefixes, segments: ['collector', 'bgp', 'advertised-prefixes'] },
  { get: (v) => v.collectBgpPeerGroup, segments: ['collector', 'bgp', 'peer-group'] },
  { get: (v) => v.collectBgpPeerHostname, segments: ['collector', 'bgp', 'peer-hostname'] },
  { get: (v) => v.collectBgpPeerType, segments: ['collector', 'bgp', 'peer-type'] },
  { get: (v) => v.collectBgpL2Vpn, segments: ['collector', 'bgp-l2-vpn'] },
  { get: (v) => v.collectPim, segments: ['collector', 'pim'] },
  { get: (v) => v.collectDetailedRoutes, segments: ['collector', 'detailed-routes'] },
]

export function frrExporterFormToOps(
  before: PrometheusFrrExporterConfig,
  values: FrrExporterFormValues,
): ConfigOp[] {
  const beforeValues = frrExporterConfigToFormValues(before)
  const ops: ConfigOp[] = []
  const base = prometheusFrrExporterPath()

  for (const field of FRR_FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: FrrExporterFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.port, segments: ['port'] },
    { get: (v) => v.vrf, segments: ['vrf'] },
    { get: (v) => v.collectBgpPeerDescription, segments: ['collector', 'bgp', 'peer-description'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function enableFrrExporterOp(): ConfigOp {
  return { op: 'set', path: prometheusFrrExporterPath() }
}

export function disableFrrExporterOp(): ConfigOp {
  return { op: 'delete', path: prometheusFrrExporterPath() }
}

// --- Zabbix agent --------------------------------------------------------

export interface ZabbixAgentFormValues {
  pskId: string
  pskSecret: string
  directory: string
  hostName: string
  bufferFlushInterval: string
  bufferSize: string
  debugLevel: string
  logRemoteCommands: boolean
  logSize: string
  port: string
  timeout: string
  vrf: string
}

export function blankZabbixAgentFormValues(): ZabbixAgentFormValues {
  return {
    pskId: '',
    pskSecret: '',
    directory: '',
    hostName: '',
    bufferFlushInterval: '',
    bufferSize: '',
    debugLevel: '',
    logRemoteCommands: false,
    logSize: '',
    port: '',
    timeout: '',
    vrf: '',
  }
}

export function zabbixAgentConfigToFormValues(config: ZabbixAgentConfig): ZabbixAgentFormValues {
  return {
    pskId: config.pskId ?? '',
    pskSecret: '',
    directory: config.directory ?? '',
    hostName: config.hostName ?? '',
    bufferFlushInterval: config.bufferFlushInterval ?? '',
    bufferSize: config.bufferSize ?? '',
    debugLevel: config.debugLevel ?? '',
    logRemoteCommands: config.logRemoteCommands,
    logSize: config.logSize ?? '',
    port: config.port ?? '',
    timeout: config.timeout ?? '',
    vrf: config.vrf ?? '',
  }
}

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps, plus the write-only
 * `pskSecret` handling from systemUserForm.ts's userFormToOps
 * (`authentication mode` is always set to 'pre-shared-secret' - the
 * only value VyOS's schema currently offers - whenever a PSK ID or
 * secret is provided). */
export function zabbixAgentFormToOps(before: ZabbixAgentConfig, values: ZabbixAgentFormValues): ConfigOp[] {
  const beforeValues = zabbixAgentConfigToFormValues(before)
  const ops: ConfigOp[] = []
  const base = zabbixAgentPath()

  if (beforeValues.logRemoteCommands !== values.logRemoteCommands) {
    const path = [...base, 'log', 'remote-commands']
    ops.push(values.logRemoteCommands ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: ZabbixAgentFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.pskId, segments: ['authentication', 'psk', 'id'] },
    { get: (v) => v.directory, segments: ['directory'] },
    { get: (v) => v.hostName, segments: ['host-name'] },
    { get: (v) => v.bufferFlushInterval, segments: ['limits', 'buffer-flush-interval'] },
    { get: (v) => v.bufferSize, segments: ['limits', 'buffer-size'] },
    { get: (v) => v.debugLevel, segments: ['log', 'debug-level'] },
    { get: (v) => v.logSize, segments: ['log', 'size'] },
    { get: (v) => v.port, segments: ['port'] },
    { get: (v) => v.timeout, segments: ['timeout'] },
    { get: (v) => v.vrf, segments: ['vrf'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  if (values.pskId.trim() || values.pskSecret.trim()) {
    if (before.authMode !== 'pre-shared-secret') {
      ops.push({ op: 'set', path: [...base, 'authentication', 'mode'], value: 'pre-shared-secret' })
    }
  }
  const trimmedSecret = values.pskSecret.trim()
  if (trimmedSecret) {
    ops.push({ op: 'set', path: [...base, 'authentication', 'psk', 'secret'], value: trimmedSecret })
  }

  return ops
}

export function enableZabbixAgentOp(): ConfigOp {
  return { op: 'set', path: zabbixAgentPath() }
}

export function disableZabbixAgentOp(): ConfigOp {
  return { op: 'delete', path: zabbixAgentPath() }
}

export function addZabbixServerActiveOps(address: string, port: string): ConfigOp[] {
  const base = zabbixServerActivePath(address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (port.trim()) ops.push({ op: 'set', path: [...base, 'port'], value: port.trim() })
  return ops
}

export function removeZabbixServerActiveOp(address: string): ConfigOp {
  return { op: 'delete', path: zabbixServerActivePath(address) }
}

// --- Network events ------------------------------------------------------

export interface NetworkEventFormValues {
  eventRoute: boolean
  eventLink: boolean
  eventAddr: boolean
  eventNeigh: boolean
  eventRule: boolean
  queueSize: string
  logLevel: string
}

export function blankNetworkEventFormValues(): NetworkEventFormValues {
  return {
    eventRoute: false,
    eventLink: false,
    eventAddr: false,
    eventNeigh: false,
    eventRule: false,
    queueSize: '',
    logLevel: '',
  }
}

export function networkEventConfigToFormValues(config: NetworkEventConfig): NetworkEventFormValues {
  return {
    eventRoute: config.eventRoute,
    eventLink: config.eventLink,
    eventAddr: config.eventAddr,
    eventNeigh: config.eventNeigh,
    eventRule: config.eventRule,
    queueSize: config.queueSize ?? '',
    logLevel: config.logLevel ?? '',
  }
}

const NETWORK_EVENT_FLAG_FIELDS: { get: (v: NetworkEventFormValues) => boolean; segments: string[] }[] = [
  { get: (v) => v.eventRoute, segments: ['event', 'route'] },
  { get: (v) => v.eventLink, segments: ['event', 'link'] },
  { get: (v) => v.eventAddr, segments: ['event', 'addr'] },
  { get: (v) => v.eventNeigh, segments: ['event', 'neigh'] },
  { get: (v) => v.eventRule, segments: ['event', 'rule'] },
]

export function networkEventFormToOps(before: NetworkEventConfig, values: NetworkEventFormValues): ConfigOp[] {
  const beforeValues = networkEventConfigToFormValues(before)
  const ops: ConfigOp[] = []
  const base = networkEventPath()

  for (const field of NETWORK_EVENT_FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: NetworkEventFormValues) => string; segment: string }[] = [
    { get: (v) => v.queueSize, segment: 'queue-size' },
    { get: (v) => v.logLevel, segment: 'log-level' },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function enableNetworkEventOp(): ConfigOp {
  return { op: 'set', path: networkEventPath() }
}

export function disableNetworkEventOp(): ConfigOp {
  return { op: 'delete', path: networkEventPath() }
}
