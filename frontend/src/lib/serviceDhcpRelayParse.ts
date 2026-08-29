import {
  blankDHCPRelayConfig,
  blankDHCPv6RelayConfig,
  type DHCPRelayConfig,
  type DHCPv6RelayConfig,
  type DHCPv6RelayListenInterface,
  type DHCPv6RelayUpstreamInterface,
} from './serviceDhcpRelayTypes'

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

// --- DHCPv4 relay --------------------------------------------------------

export function parseDHCPRelayConfig(relay: unknown): DHCPRelayConfig {
  if (relay === undefined) return blankDHCPRelayConfig()
  const relayOptions = child(relay, 'relay-options')
  return {
    disabled: isFlagPresent(relay, 'disable'),
    interfaces: asStringArray(child(relay, 'interface')),
    listenInterfaces: asStringArray(child(relay, 'listen-interface')),
    upstreamInterfaces: asStringArray(child(relay, 'upstream-interface')),
    hopCount: asString(child(relayOptions, 'hop-count')),
    maxSize: asString(child(relayOptions, 'max-size')),
    relayAgentsPackets: asString(child(relayOptions, 'relay-agents-packets')),
    servers: asStringArray(child(relay, 'server')),
  }
}

export function dhcpRelayPath(...rest: string[]): string[] {
  return ['service', 'dhcp-relay', ...rest]
}

export function dhcpRelayOptionsPath(...rest: string[]): string[] {
  return dhcpRelayPath('relay-options', ...rest)
}

// --- DHCPv6 relay ----------------------------------------------------------

function parseListenInterface(interfaceName: string, raw: unknown): DHCPv6RelayListenInterface {
  return { interfaceName, address: asString(child(raw, 'address')) }
}

function parseUpstreamInterface(interfaceName: string, raw: unknown): DHCPv6RelayUpstreamInterface {
  return { interfaceName, addresses: asStringArray(child(raw, 'address')) }
}

export function parseDHCPv6RelayConfig(relay: unknown): DHCPv6RelayConfig {
  if (relay === undefined) return blankDHCPv6RelayConfig()
  return {
    disabled: isFlagPresent(relay, 'disable'),
    listenInterfaces: entries(child(relay, 'listen-interface'))
      .map(([name, raw]) => parseListenInterface(name, raw))
      .sort((a, b) => a.interfaceName.localeCompare(b.interfaceName)),
    upstreamInterfaces: entries(child(relay, 'upstream-interface'))
      .map(([name, raw]) => parseUpstreamInterface(name, raw))
      .sort((a, b) => a.interfaceName.localeCompare(b.interfaceName)),
    maxHopCount: asString(child(relay, 'max-hop-count')),
    useInterfaceIdOption: isFlagPresent(relay, 'use-interface-id-option'),
  }
}

export function dhcpv6RelayPath(...rest: string[]): string[] {
  return ['service', 'dhcpv6-relay', ...rest]
}

export function dhcpv6RelayListenInterfacePath(interfaceName: string, ...rest: string[]): string[] {
  return dhcpv6RelayPath('listen-interface', interfaceName, ...rest)
}

export function dhcpv6RelayUpstreamInterfacePath(interfaceName: string, ...rest: string[]): string[] {
  return dhcpv6RelayPath('upstream-interface', interfaceName, ...rest)
}
