/**
 * Typed, UI-friendly shapes for `service dhcp-relay` (DHCPv4 relay)
 * and `service dhcpv6-relay` (DHCPv6 relay). Confirmed against
 * vyos-1x's own interface-definition XML source - both are small,
 * full coverage. Notably these two services have genuinely different
 * shapes for what looks like the same concept: v4's
 * `listen-interface`/`upstream-interface` are plain multi-valued
 * leaves (a flat list of interface names), while v6's are tagNodes
 * keyed by interface name with their own nested `address` child
 * (single-valued for `listen-interface`, multi-valued for
 * `upstream-interface`) - not a shared shape, so not a shared type.
 */

export const DHCP_RELAY_AGENTS_PACKETS_MODES = ['append', 'replace', 'forward', 'discard'] as const

export interface DHCPRelayConfig {
  disabled: boolean
  interfaces: string[]
  listenInterfaces: string[]
  upstreamInterfaces: string[]
  /** Defaults to '10' in VyOS if unset. */
  hopCount?: string
  /** Defaults to '576' in VyOS if unset. */
  maxSize?: string
  /** Defaults to 'forward' in VyOS if unset. */
  relayAgentsPackets?: string
  servers: string[]
}

export function blankDHCPRelayConfig(): DHCPRelayConfig {
  return { disabled: false, interfaces: [], listenInterfaces: [], upstreamInterfaces: [], servers: [] }
}

export interface DHCPv6RelayListenInterface {
  interfaceName: string
  address?: string
}

export interface DHCPv6RelayUpstreamInterface {
  interfaceName: string
  addresses: string[]
}

export interface DHCPv6RelayConfig {
  disabled: boolean
  listenInterfaces: DHCPv6RelayListenInterface[]
  upstreamInterfaces: DHCPv6RelayUpstreamInterface[]
  /** Defaults to '10' in VyOS if unset. */
  maxHopCount?: string
  useInterfaceIdOption: boolean
}

export function blankDHCPv6RelayConfig(): DHCPv6RelayConfig {
  return { disabled: false, listenInterfaces: [], upstreamInterfaces: [], useInterfaceIdOption: false }
}
