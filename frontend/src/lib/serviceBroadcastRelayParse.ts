import {
  blankBroadcastRelayConfig,
  blankBroadcastRelayInstance,
  type BroadcastRelayConfig,
  type BroadcastRelayInstance,
} from './serviceBroadcastRelayTypes'

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

function parseInstance(id: string, raw: unknown): BroadcastRelayInstance {
  return {
    id,
    ...blankBroadcastRelayInstance(),
    disabled: isFlagPresent(raw, 'disable'),
    address: asString(child(raw, 'address')),
    description: asString(child(raw, 'description')),
    interfaces: asStringArray(child(raw, 'interface')),
    port: asString(child(raw, 'port')),
  }
}

export function parseBroadcastRelayConfig(relay: unknown): BroadcastRelayConfig {
  if (relay === undefined) return blankBroadcastRelayConfig()
  return {
    enabled: true,
    disabled: isFlagPresent(relay, 'disable'),
    instances: entries(child(relay, 'id'))
      .map(([id, raw]) => parseInstance(id, raw))
      .sort((a, b) => Number(a.id) - Number(b.id)),
  }
}

// --- path builders -----------------------------------------------------

export function broadcastRelayPath(...rest: string[]): string[] {
  return ['service', 'broadcast-relay', ...rest]
}

export function broadcastRelayInstancePath(id: string, ...rest: string[]): string[] {
  return broadcastRelayPath('id', id, ...rest)
}
