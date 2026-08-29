import {
  blankDynamicDNSConfig,
  blankDynamicDNSEntry,
  type DynamicDNSConfig,
  type DynamicDNSEntry,
} from './serviceDnsDynamicTypes'

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

function parseEntry(name: string, raw: unknown): DynamicDNSEntry {
  const addressRoot = child(raw, 'address')
  const webRoot = child(addressRoot, 'web')
  const interfaceValue = asString(child(addressRoot, 'interface'))
  const webUrl = asString(child(webRoot, 'url'))
  const webSkip = asString(child(webRoot, 'skip'))

  let addressMode: 'interface' | 'web' | undefined
  if (interfaceValue !== undefined) addressMode = 'interface'
  else if (webRoot !== undefined) addressMode = 'web'

  return {
    name,
    ...blankDynamicDNSEntry(),
    description: asString(child(raw, 'description')),
    protocol: asString(child(raw, 'protocol')),
    addressMode,
    addressInterface: interfaceValue,
    addressWebUrl: webUrl,
    addressWebSkip: webSkip,
    ipVersion: asString(child(raw, 'ip-version')),
    hostNames: asStringArray(child(raw, 'host-name')),
    server: asString(child(raw, 'server')),
    zone: asString(child(raw, 'zone')),
    username: asString(child(raw, 'username')),
    hasPassword: child(raw, 'password') !== undefined,
    key: asString(child(raw, 'key')),
    ttl: asString(child(raw, 'ttl')),
    waitTime: asString(child(raw, 'wait-time')),
    expiryTime: asString(child(raw, 'expiry-time')),
  }
}

export function parseDynamicDNSConfig(dynamic: unknown): DynamicDNSConfig {
  if (dynamic === undefined) return blankDynamicDNSConfig()
  const nameRoot = child(dynamic, 'name')
  const entries = isRecord(nameRoot)
    ? Object.entries(nameRoot)
        .map(([name, raw]) => parseEntry(name, raw))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  return {
    entries,
    interval: asString(child(dynamic, 'interval')),
    vrf: asString(child(dynamic, 'vrf')),
  }
}

// --- path builders -----------------------------------------------------

export function dynamicDnsPath(...rest: string[]): string[] {
  return ['service', 'dns', 'dynamic', ...rest]
}

export function dynamicDnsEntryPath(name: string, ...rest: string[]): string[] {
  return dynamicDnsPath('name', name, ...rest)
}
