import {
  blankGeneralSettings,
  blankSyslogConfig,
  type StaticHostMapping,
  type SyslogFacilityRule,
  type SyslogRemoteHost,
  type SystemConfig,
  type SystemGeneralSettings,
  type SystemSyslogConfig,
  type SystemUser,
  type SystemUserPublicKey,
} from './systemTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/ospfParse.ts's
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

// --- general settings --------------------------------------------------

export function parseGeneralSettings(system: unknown): SystemGeneralSettings {
  if (system === undefined) return blankGeneralSettings()
  return {
    hostName: asString(child(system, 'host-name')),
    domainName: asString(child(system, 'domain-name')),
    domainSearch: asStringArray(child(system, 'domain-search')),
    nameServers: asStringArray(child(system, 'name-server')),
    timeZone: asString(child(system, 'time-zone')),
  }
}

export function parseStaticHostMappings(system: unknown): StaticHostMapping[] {
  const root = child(child(system, 'static-host-mapping'), 'host-name')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([hostName, raw]) => ({
      hostName,
      addresses: asStringArray(child(raw, 'inet')),
      aliases: asStringArray(child(raw, 'alias')),
    }))
    .sort((a, b) => a.hostName.localeCompare(b.hostName))
}

// --- users -----------------------------------------------------------

function parsePublicKey(identifier: string, raw: unknown): SystemUserPublicKey {
  return {
    identifier,
    type: asString(child(raw, 'type')),
    options: asString(child(raw, 'options')),
    hasKey: child(raw, 'key') !== undefined,
  }
}

function parseUser(username: string, raw: unknown): SystemUser {
  const authRoot = child(raw, 'authentication')
  const publicKeysRoot = child(authRoot, 'public-keys')
  const publicKeys = isRecord(publicKeysRoot)
    ? Object.entries(publicKeysRoot)
        .map(([identifier, keyRaw]) => parsePublicKey(identifier, keyRaw))
        .sort((a, b) => a.identifier.localeCompare(b.identifier))
    : []

  return {
    username,
    fullName: asString(child(raw, 'full-name')),
    disabled: isFlagPresent(raw, 'disable'),
    hasPassword: child(authRoot, 'encrypted-password') !== undefined,
    publicKeys,
  }
}

export function parseUsers(system: unknown): SystemUser[] {
  const root = child(child(system, 'login'), 'user')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([username, raw]) => parseUser(username, raw))
    .sort((a, b) => a.username.localeCompare(b.username))
}

// --- syslog ------------------------------------------------------------

function parseFacilityRules(root: unknown): SyslogFacilityRule[] {
  const facilityRoot = child(root, 'facility')
  if (!isRecord(facilityRoot)) return []
  return Object.entries(facilityRoot)
    .map(([facility, raw]) => ({ facility, level: asString(child(raw, 'level')) }))
    .sort((a, b) => a.facility.localeCompare(b.facility))
}

function parseRemoteHost(address: string, raw: unknown): SyslogRemoteHost {
  return {
    address,
    facilities: parseFacilityRules(raw),
    protocol: asString(child(raw, 'protocol')) as 'tcp' | 'udp' | undefined,
    port: asString(child(raw, 'port')),
  }
}

export function parseSyslogConfig(system: unknown): SystemSyslogConfig {
  const syslogRoot = child(system, 'syslog')
  if (syslogRoot === undefined) return blankSyslogConfig()

  const remoteRoot = child(syslogRoot, 'remote')
  const remote = isRecord(remoteRoot)
    ? Object.entries(remoteRoot)
        .map(([address, raw]) => parseRemoteHost(address, raw))
        .sort((a, b) => a.address.localeCompare(b.address))
    : []

  return {
    local: parseFacilityRules(child(syslogRoot, 'local')),
    remote,
  }
}

// --- top level -------------------------------------------------------------

export function parseSystemConfig(system: unknown): SystemConfig {
  return {
    general: parseGeneralSettings(system),
    staticHostMappings: parseStaticHostMappings(system),
    users: parseUsers(system),
    syslog: parseSyslogConfig(system),
  }
}

// --- path builders -----------------------------------------------------

export function systemPath(...rest: string[]): string[] {
  return ['system', ...rest]
}

export function staticHostMappingPath(hostName: string, ...rest: string[]): string[] {
  return systemPath('static-host-mapping', 'host-name', hostName, ...rest)
}

export function userPath(username: string, ...rest: string[]): string[] {
  return systemPath('login', 'user', username, ...rest)
}

export function publicKeyPath(username: string, identifier: string, ...rest: string[]): string[] {
  return userPath(username, 'authentication', 'public-keys', identifier, ...rest)
}

export function syslogLocalPath(...rest: string[]): string[] {
  return systemPath('syslog', 'local', ...rest)
}

export function syslogRemotePath(address: string, ...rest: string[]): string[] {
  return systemPath('syslog', 'remote', address, ...rest)
}
