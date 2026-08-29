import {
  blankDHCPv6Option,
  blankDHCPv6ServerConfig,
  blankDHCPv6SharedNetwork,
  blankDHCPv6Subnet,
  type DHCPv6Option,
  type DHCPv6PrefixDelegation,
  type DHCPv6Range,
  type DHCPv6ServerConfig,
  type DHCPv6SharedNetwork,
  type DHCPv6StaticMapping,
  type DHCPv6Subnet,
} from './serviceDhcpv6ServerTypes'

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

function parseOption(raw: unknown): DHCPv6Option {
  const root = child(raw, 'option')
  if (root === undefined) return blankDHCPv6Option()
  return {
    nameServers: asStringArray(child(root, 'name-server')),
    domainSearch: asStringArray(child(root, 'domain-search')),
    sntpServers: asStringArray(child(root, 'sntp-server')),
  }
}

function parseRange(id: string, raw: unknown): DHCPv6Range {
  return {
    id,
    prefix: asString(child(raw, 'prefix')),
    start: asString(child(raw, 'start')),
    stop: asString(child(raw, 'stop')),
  }
}

function parsePrefixDelegation(prefix: string, raw: unknown): DHCPv6PrefixDelegation {
  return {
    prefix,
    prefixLength: asString(child(raw, 'prefix-length')),
    delegatedLength: asString(child(raw, 'delegated-length')),
    excludedPrefix: asString(child(raw, 'excluded-prefix')),
    excludedPrefixLength: asString(child(raw, 'excluded-prefix-length')),
  }
}

function parseStaticMapping(hostname: string, raw: unknown): DHCPv6StaticMapping {
  return {
    hostname,
    disabled: isFlagPresent(raw, 'disable'),
    mac: asString(child(raw, 'mac')),
    duid: asString(child(raw, 'duid')),
    ipv6Addresses: asStringArray(child(raw, 'ipv6-address')),
    ipv6Prefixes: asStringArray(child(raw, 'ipv6-prefix')),
  }
}

function parseSubnet(cidr: string, raw: unknown): DHCPv6Subnet {
  const leaseTime = child(raw, 'lease-time')
  const prefixDelegationRoot = child(child(raw, 'prefix-delegation'), 'prefix')
  return {
    cidr,
    ...blankDHCPv6Subnet(),
    interface: asString(child(raw, 'interface')),
    subnetId: asString(child(raw, 'subnet-id')),
    leaseDefault: asString(child(leaseTime, 'default')),
    leaseMaximum: asString(child(leaseTime, 'maximum')),
    leaseMinimum: asString(child(leaseTime, 'minimum')),
    option: parseOption(raw),
    ranges: entries(child(raw, 'range'))
      .map(([id, rangeRaw]) => parseRange(id, rangeRaw))
      .sort((a, b) => a.id.localeCompare(b.id)),
    staticMappings: entries(child(raw, 'static-mapping'))
      .map(([hostname, mappingRaw]) => parseStaticMapping(hostname, mappingRaw))
      .sort((a, b) => a.hostname.localeCompare(b.hostname)),
    prefixDelegations: entries(prefixDelegationRoot)
      .map(([prefix, pdRaw]) => parsePrefixDelegation(prefix, pdRaw))
      .sort((a, b) => a.prefix.localeCompare(b.prefix)),
  }
}

function parseSharedNetwork(name: string, raw: unknown): DHCPv6SharedNetwork {
  return {
    name,
    ...blankDHCPv6SharedNetwork(),
    disabled: isFlagPresent(raw, 'disable'),
    description: asString(child(raw, 'description')),
    interface: asString(child(raw, 'interface')),
    option: parseOption(raw),
    subnets: entries(child(raw, 'subnet'))
      .map(([cidr, subnetRaw]) => parseSubnet(cidr, subnetRaw))
      .sort((a, b) => a.cidr.localeCompare(b.cidr)),
  }
}

export function parseDHCPv6ServerConfig(dhcpv6Server: unknown): DHCPv6ServerConfig {
  if (dhcpv6Server === undefined) return blankDHCPv6ServerConfig()
  return {
    enabled: true,
    disabled: isFlagPresent(dhcpv6Server, 'disable'),
    listenInterfaces: asStringArray(child(dhcpv6Server, 'listen-interface')),
    disableRouteAutoinstall: isFlagPresent(dhcpv6Server, 'disable-route-autoinstall'),
    preference: asString(child(dhcpv6Server, 'preference')),
    logLevel: asString(child(dhcpv6Server, 'log-level')),
    globalNameServers: asStringArray(child(child(dhcpv6Server, 'global-parameters'), 'name-server')),
    sharedNetworks: entries(child(dhcpv6Server, 'shared-network-name'))
      .map(([name, raw]) => parseSharedNetwork(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

// --- path builders -----------------------------------------------------

export function dhcpv6ServerPath(...rest: string[]): string[] {
  return ['service', 'dhcpv6-server', ...rest]
}

export function dhcpv6GlobalParametersPath(...rest: string[]): string[] {
  return dhcpv6ServerPath('global-parameters', ...rest)
}

export function dhcpv6SharedNetworkPath(name: string, ...rest: string[]): string[] {
  return dhcpv6ServerPath('shared-network-name', name, ...rest)
}

export function dhcpv6SubnetPath(networkName: string, cidr: string, ...rest: string[]): string[] {
  return dhcpv6SharedNetworkPath(networkName, 'subnet', cidr, ...rest)
}

export function dhcpv6RangePath(networkName: string, cidr: string, id: string, ...rest: string[]): string[] {
  return dhcpv6SubnetPath(networkName, cidr, 'range', id, ...rest)
}

export function dhcpv6StaticMappingPath(
  networkName: string,
  cidr: string,
  hostname: string,
  ...rest: string[]
): string[] {
  return dhcpv6SubnetPath(networkName, cidr, 'static-mapping', hostname, ...rest)
}

export function dhcpv6PrefixDelegationPath(
  networkName: string,
  cidr: string,
  prefix: string,
  ...rest: string[]
): string[] {
  return dhcpv6SubnetPath(networkName, cidr, 'prefix-delegation', 'prefix', prefix, ...rest)
}

export function dhcpv6OptionPath(base: string[], ...rest: string[]): string[] {
  return [...base, 'option', ...rest]
}
