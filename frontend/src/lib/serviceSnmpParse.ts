import {
  blankSNMPCommunity,
  blankSNMPConfig,
  blankSNMPv3AuthConfig,
  blankSNMPv3Config,
  blankSNMPv3PrivacyConfig,
  blankSNMPv3TrapTarget,
  blankSNMPv3User,
  blankSNMPv3View,
  blankSNMPv3ViewOid,
  type SNMPCommunity,
  type SNMPConfig,
  type SNMPListenAddress,
  type SNMPTrapTarget,
  type SNMPv3AuthConfig,
  type SNMPv3Config,
  type SNMPv3Group,
  type SNMPv3PrivacyConfig,
  type SNMPv3TrapTarget,
  type SNMPv3User,
  type SNMPv3View,
  type SNMPv3ViewOid,
} from './serviceSnmpTypes'

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

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') return [v]
  return []
}

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

function parseCommunity(name: string, raw: unknown): SNMPCommunity {
  return {
    name,
    ...blankSNMPCommunity(),
    authorization: asString(child(raw, 'authorization')),
    clients: asStringArray(child(raw, 'client')),
    networks: asStringArray(child(raw, 'network')),
  }
}

function parseListenAddress(address: string, raw: unknown): SNMPListenAddress {
  return { address, port: asString(child(raw, 'port')) }
}

function parseTrapTarget(address: string, raw: unknown): SNMPTrapTarget {
  return { address, hasCommunity: child(raw, 'community') !== undefined, port: asString(child(raw, 'port')) }
}

function parseV3Auth(raw: unknown): SNMPv3AuthConfig {
  const root = child(raw, 'auth')
  return {
    ...blankSNMPv3AuthConfig(),
    hasPassword: child(root, 'encrypted-password') !== undefined || child(root, 'plaintext-password') !== undefined,
    type: asString(child(root, 'type')),
  }
}

function parseV3Privacy(raw: unknown): SNMPv3PrivacyConfig {
  const root = child(raw, 'privacy')
  return {
    ...blankSNMPv3PrivacyConfig(),
    hasPassword: child(root, 'encrypted-password') !== undefined || child(root, 'plaintext-password') !== undefined,
    type: asString(child(root, 'type')),
  }
}

function parseV3Group(name: string, raw: unknown): SNMPv3Group {
  return {
    name,
    mode: asString(child(raw, 'mode')),
    seclevel: asString(child(raw, 'seclevel')),
    view: asString(child(raw, 'view')),
  }
}

function parseV3User(name: string, raw: unknown): SNMPv3User {
  return {
    name,
    ...blankSNMPv3User(),
    auth: parseV3Auth(raw),
    group: asString(child(raw, 'group')),
    mode: asString(child(raw, 'mode')),
    privacy: parseV3Privacy(raw),
  }
}

function parseV3ViewOid(oid: string, raw: unknown): SNMPv3ViewOid {
  return {
    oid,
    ...blankSNMPv3ViewOid(),
    exclude: asStringArray(child(raw, 'exclude')),
    mask: asString(child(raw, 'mask')),
  }
}

function parseV3View(name: string, raw: unknown): SNMPv3View {
  return {
    name,
    ...blankSNMPv3View(),
    oids: entries(child(raw, 'oid'))
      .map(([oid, oidRaw]) => parseV3ViewOid(oid, oidRaw))
      .sort((a, b) => a.oid.localeCompare(b.oid)),
  }
}

function parseV3TrapTarget(address: string, raw: unknown): SNMPv3TrapTarget {
  return {
    address,
    ...blankSNMPv3TrapTarget(),
    auth: parseV3Auth(raw),
    privacy: parseV3Privacy(raw),
    port: asString(child(raw, 'port')),
    protocol: asString(child(raw, 'protocol')),
    type: asString(child(raw, 'type')),
    user: asString(child(raw, 'user')),
  }
}

function parseSNMPv3Config(v3: unknown): SNMPv3Config {
  if (v3 === undefined) return blankSNMPv3Config()
  return {
    engineId: asString(child(v3, 'engineid')),
    groups: entries(child(v3, 'group'))
      .map(([name, raw]) => parseV3Group(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    users: entries(child(v3, 'user'))
      .map(([name, raw]) => parseV3User(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    views: entries(child(v3, 'view'))
      .map(([name, raw]) => parseV3View(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    trapTargets: entries(child(v3, 'trap-target'))
      .map(([address, raw]) => parseV3TrapTarget(address, raw))
      .sort((a, b) => a.address.localeCompare(b.address)),
  }
}

export function parseSNMPConfig(snmp: unknown): SNMPConfig {
  if (snmp === undefined) return blankSNMPConfig()
  return {
    enabled: true,
    communities: entries(child(snmp, 'community'))
      .map(([name, raw]) => parseCommunity(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    contact: asString(child(snmp, 'contact')),
    location: asString(child(snmp, 'location')),
    description: asString(child(snmp, 'description')),
    listenAddresses: entries(child(snmp, 'listen-address'))
      .map(([address, raw]) => parseListenAddress(address, raw))
      .sort((a, b) => a.address.localeCompare(b.address)),
    trapSource: asString(child(snmp, 'trap-source')),
    trapTargets: entries(child(snmp, 'trap-target'))
      .map(([address, raw]) => parseTrapTarget(address, raw))
      .sort((a, b) => a.address.localeCompare(b.address)),
    protocol: asString(child(snmp, 'protocol')),
    v3: parseSNMPv3Config(child(snmp, 'v3')),
  }
}

// --- path builders -----------------------------------------------------

export function snmpPath(...rest: string[]): string[] {
  return ['service', 'snmp', ...rest]
}

export function snmpCommunityPath(name: string, ...rest: string[]): string[] {
  return snmpPath('community', name, ...rest)
}

export function snmpListenAddressPath(address: string, ...rest: string[]): string[] {
  return snmpPath('listen-address', address, ...rest)
}

export function snmpTrapTargetPath(address: string, ...rest: string[]): string[] {
  return snmpPath('trap-target', address, ...rest)
}

export function snmpV3Path(...rest: string[]): string[] {
  return snmpPath('v3', ...rest)
}

export function snmpV3GroupPath(name: string, ...rest: string[]): string[] {
  return snmpV3Path('group', name, ...rest)
}

export function snmpV3UserPath(name: string, ...rest: string[]): string[] {
  return snmpV3Path('user', name, ...rest)
}

export function snmpV3ViewPath(name: string, ...rest: string[]): string[] {
  return snmpV3Path('view', name, ...rest)
}

export function snmpV3ViewOidPath(viewName: string, oid: string, ...rest: string[]): string[] {
  return snmpV3ViewPath(viewName, 'oid', oid, ...rest)
}

export function snmpV3TrapTargetPath(address: string, ...rest: string[]): string[] {
  return snmpV3Path('trap-target', address, ...rest)
}
