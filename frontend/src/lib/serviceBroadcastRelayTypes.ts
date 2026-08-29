/**
 * Typed, UI-friendly shape for `service broadcast-relay`. Confirmed
 * against vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_broadcast-relay.xml.in`). Full
 * coverage - small area.
 *
 * Forwards UDP broadcast traffic (e.g. Wake-on-LAN) between
 * interfaces. Note there are two independent `disable` switches: one
 * at the service level (all instances) and one per numbered instance.
 */

export interface BroadcastRelayInstance {
  /** The tag under `id <1-99>`. */
  id: string
  disabled: boolean
  /** Source IPv4 address for forwarded packets - IPv4-only validator,
   * unlike most "address" fields in this app. */
  address?: string
  description?: string
  interfaces: string[]
  port?: string
}

export function blankBroadcastRelayInstance(): Omit<BroadcastRelayInstance, 'id'> {
  return { disabled: false, interfaces: [] }
}

export interface BroadcastRelayConfig {
  /** Whether `service broadcast-relay` exists at all in the tree. */
  enabled: boolean
  disabled: boolean
  instances: BroadcastRelayInstance[]
}

export function blankBroadcastRelayConfig(): BroadcastRelayConfig {
  return { enabled: false, disabled: false, instances: [] }
}
