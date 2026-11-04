import {
  blankBroadcastRelayConfig,
  blankBroadcastRelayInstance,
  type BroadcastRelayConfig,
  type BroadcastRelayInstance,
} from './serviceBroadcastRelayTypes'
import { isRecord, asString, asStringArray, child, isFlagPresent } from './configTree'

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
