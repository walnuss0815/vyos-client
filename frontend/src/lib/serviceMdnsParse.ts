import { blankMdnsRepeaterConfig, type MdnsRepeaterConfig } from './serviceMdnsTypes'

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

export function parseMdnsRepeaterConfig(repeater: unknown): MdnsRepeaterConfig {
  if (repeater === undefined) return blankMdnsRepeaterConfig()
  return {
    enabled: true,
    disabled: isFlagPresent(repeater, 'disable'),
    interfaces: asStringArray(child(repeater, 'interface')),
    ipVersion: asString(child(repeater, 'ip-version')),
    browseDomains: asStringArray(child(repeater, 'browse-domain')),
    allowServices: asStringArray(child(repeater, 'allow-service')),
    cacheEntries: asString(child(repeater, 'cache-entries')),
    vrrpDisable: isFlagPresent(repeater, 'vrrp-disable'),
  }
}

// --- path builders -----------------------------------------------------

export function mdnsRepeaterPath(...rest: string[]): string[] {
  return ['service', 'mdns', 'repeater', ...rest]
}
