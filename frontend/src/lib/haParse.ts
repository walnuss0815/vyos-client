import type {
  ConntrackSyncConfig,
  ConntrackSyncInterface,
  HAConfig,
  VRRPAddress,
  VRRPGarpSettings,
  VRRPGroup,
  VRRPHealthCheck,
  VRRPSyncGroup,
  VRRPTransitionScripts,
} from './haTypes'

// --- generic VyOS JSON-tree helpers (mirrors firewallParse.ts's/
// loadBalancingParse.ts's own copies) --------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asArray(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (Array.isArray(v)) return v.map(String)
  return [String(v)]
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function numberOrUndefined(v: unknown): number | undefined {
  const s = asString(v)
  if (s === undefined) return undefined
  const n = Number(s)
  // Number.isFinite, not just !Number.isNaN: Number("Infinity") and
  // Number("-Infinity") are both legitimate finite-looking JS numeric
  // conversions of a non-numeric string, which isNaN alone lets
  // through as a "valid" value for a field like priority/cost/
  // bandwidth that should never actually be infinite.
  return Number.isFinite(n) ? n : undefined
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

// --- path helpers ----------------------------------------------------

export function haPath(...rest: string[]): string[] {
  return ['high-availability', ...rest]
}

export function vrrpPath(...rest: string[]): string[] {
  return haPath('vrrp', ...rest)
}

export function vrrpGroupPath(name: string, ...rest: string[]): string[] {
  return [...vrrpPath('group'), name, ...rest]
}

export function vrrpSyncGroupPath(name: string, ...rest: string[]): string[] {
  return [...vrrpPath('sync-group'), name, ...rest]
}

export function conntrackSyncPath(...rest: string[]): string[] {
  return ['service', 'conntrack-sync', ...rest]
}

export function conntrackSyncInterfacePath(name: string, ...rest: string[]): string[] {
  return [...conntrackSyncPath('interface'), name, ...rest]
}

// --- VRRP ------------------------------------------------------------

function parseVRRPHealthCheck(raw: unknown): VRRPHealthCheck | undefined {
  if (!isRecord(raw)) return undefined
  return {
    failureCount: numberOrUndefined(child(raw, 'failure-count')) ?? 3,
    interval: numberOrUndefined(child(raw, 'interval')) ?? 60,
    ping: asString(child(raw, 'ping')),
    script: asString(child(raw, 'script')),
    timeout: numberOrUndefined(child(raw, 'timeout')),
  }
}

function parseTransitionScripts(raw: unknown): VRRPTransitionScripts {
  return {
    master: asString(child(raw, 'master')),
    backup: asString(child(raw, 'backup')),
    fault: asString(child(raw, 'fault')),
    stop: asString(child(raw, 'stop')),
  }
}

function parseVRRPAddresses(raw: unknown): VRRPAddress[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw).map(([address, v]) => ({
    address,
    interface: asString(child(v, 'interface')),
  }))
}

function parseVRRPGroup(name: string, raw: unknown): VRRPGroup {
  const auth = child(raw, 'authentication')
  const track = child(raw, 'track')
  return {
    name,
    interface: asString(child(raw, 'interface')),
    vrid: asString(child(raw, 'vrid')),
    priority: numberOrUndefined(child(raw, 'priority')) ?? 100,
    advertiseInterval: numberOrUndefined(child(raw, 'advertise-interval')) ?? 1,
    description: asString(child(raw, 'description')),
    disabled: isFlagPresent(raw, 'disable'),
    noPreempt: isFlagPresent(raw, 'no-preempt'),
    preemptDelay: numberOrUndefined(child(raw, 'preempt-delay')) ?? 0,
    rfc3768Compatibility: isFlagPresent(raw, 'rfc3768-compatibility'),
    helloSourceAddress: asString(child(raw, 'hello-source-address')),
    peerAddresses: asArray(child(raw, 'peer-address')),
    authenticationPassword: asString(child(auth, 'password')),
    authenticationType: asString(child(auth, 'type')),
    healthCheck: parseVRRPHealthCheck(child(raw, 'health-check')),
    excludeVrrpInterface: isFlagPresent(track, 'exclude-vrrp-interface'),
    trackInterfaces: asArray(child(track, 'interface')),
    transitionScripts: parseTransitionScripts(child(raw, 'transition-script')),
    addresses: parseVRRPAddresses(child(raw, 'address')),
    excludedAddresses: parseVRRPAddresses(child(raw, 'excluded-address')),
  }
}

function parseVRRPSyncGroup(name: string, raw: unknown): VRRPSyncGroup {
  return {
    name,
    members: asArray(child(raw, 'member')),
    healthCheck: parseVRRPHealthCheck(child(raw, 'health-check')),
    transitionScripts: parseTransitionScripts(child(raw, 'transition-script')),
  }
}

function parseGarp(raw: unknown): VRRPGarpSettings {
  return {
    interval: asString(child(raw, 'interval')) ?? '0',
    masterDelay: numberOrUndefined(child(raw, 'master-delay')) ?? 5,
    masterRefresh: numberOrUndefined(child(raw, 'master-refresh')) ?? 5,
    masterRefreshRepeat: numberOrUndefined(child(raw, 'master-refresh-repeat')) ?? 1,
    masterRepeat: numberOrUndefined(child(raw, 'master-repeat')) ?? 5,
  }
}

export function parseHAConfig(highAvailability: unknown): HAConfig {
  const vrrp = child(highAvailability, 'vrrp')
  const globalParams = child(vrrp, 'global-parameters')

  const groupRoot = child(vrrp, 'group')
  const groups = isRecord(groupRoot)
    ? Object.entries(groupRoot)
        .map(([n, v]) => parseVRRPGroup(n, v))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  const syncGroupRoot = child(vrrp, 'sync-group')
  const syncGroups = isRecord(syncGroupRoot)
    ? Object.entries(syncGroupRoot)
        .map(([n, v]) => parseVRRPSyncGroup(n, v))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  return {
    disabled: isFlagPresent(highAvailability, 'disable'),
    global: {
      snmpTrap: isFlagPresent(child(vrrp, 'snmp'), 'trap'),
      startupDelay: numberOrUndefined(child(globalParams, 'startup-delay')),
      version: asString(child(globalParams, 'version')),
      garp: parseGarp(child(globalParams, 'garp')),
    },
    groups,
    syncGroups,
  }
}

// --- conntrack-sync ----------------------------------------------------

function parseConntrackSyncInterfaces(raw: unknown): ConntrackSyncInterface[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw).map(([name, v]) => ({
    name,
    peer: asString(child(v, 'peer')),
    port: numberOrUndefined(child(v, 'port')),
  }))
}

export function parseConntrackSyncConfig(conntrackSync: unknown): ConntrackSyncConfig {
  const failoverVrrp = child(child(conntrackSync, 'failover-mechanism'), 'vrrp')
  return {
    acceptProtocols: asArray(child(conntrackSync, 'accept-protocol')),
    disableExternalCache: isFlagPresent(conntrackSync, 'disable-external-cache'),
    disableSyslog: isFlagPresent(conntrackSync, 'disable-syslog'),
    eventListenQueueSize: numberOrUndefined(child(conntrackSync, 'event-listen-queue-size')) ?? 8,
    expectSync: asArray(child(conntrackSync, 'expect-sync')),
    startupResync: isFlagPresent(conntrackSync, 'startup-resync'),
    vrrpSyncGroup: asString(child(failoverVrrp, 'sync-group')),
    ignoreAddresses: asArray(child(conntrackSync, 'ignore-address')),
    interfaces: parseConntrackSyncInterfaces(child(conntrackSync, 'interface')),
    listenAddresses: asArray(child(conntrackSync, 'listen-address')),
    mcastGroup: asString(child(conntrackSync, 'mcast-group')) ?? '225.0.0.50',
    syncQueueSize: numberOrUndefined(child(conntrackSync, 'sync-queue-size')) ?? 1,
    purgeTimeout: numberOrUndefined(child(conntrackSync, 'purge-timeout')) ?? 60,
  }
}
