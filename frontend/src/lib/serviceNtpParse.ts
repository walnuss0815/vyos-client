import { blankNTPConfig, type NTPConfig, type NTPServer } from './serviceNtpTypes'

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

function parseServer(address: string, raw: unknown): NTPServer {
  return {
    address,
    prefer: isFlagPresent(raw, 'prefer'),
    pool: isFlagPresent(raw, 'pool'),
    noselect: isFlagPresent(raw, 'noselect'),
    nts: isFlagPresent(raw, 'nts'),
    ptp: isFlagPresent(raw, 'ptp'),
    interleave: isFlagPresent(raw, 'interleave'),
  }
}

function parseServers(ntp: unknown): NTPServer[] {
  const root = child(ntp, 'server')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([address, raw]) => parseServer(address, raw))
    .sort((a, b) => a.address.localeCompare(b.address))
}

export function parseNTPConfig(ntp: unknown): NTPConfig {
  if (ntp === undefined) return blankNTPConfig()
  return {
    servers: parseServers(ntp),
    allowClientAddresses: asStringArray(child(child(ntp, 'allow-client'), 'address')),
    listenAddresses: asStringArray(child(ntp, 'listen-address')),
    sourceAddresses: asStringArray(child(ntp, 'source-address')),
    interface: asString(child(ntp, 'interface')),
    sourceInterface: asString(child(ntp, 'source-interface')),
    vrf: asString(child(ntp, 'vrf')),
    leapSecond: asString(child(ntp, 'leap-second')),
    localStratum: asString(child(ntp, 'local-stratum')),
  }
}

// --- path builders -----------------------------------------------------

export function ntpPath(...rest: string[]): string[] {
  return ['service', 'ntp', ...rest]
}

export function ntpServerPath(address: string, ...rest: string[]): string[] {
  return ntpPath('server', address, ...rest)
}

export function ntpAllowClientPath(...rest: string[]): string[] {
  return ntpPath('allow-client', ...rest)
}
