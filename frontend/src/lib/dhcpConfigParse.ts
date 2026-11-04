import type {
  DHCPOptions,
  DHCPRange,
  DHCPSharedNetwork,
  DHCPStaticMapping,
  DHCPSubnet,
} from './dhcpConfigTypes'
import { isRecord, asString, asArray, child, isFlagPresent } from './configTree'

function asNumber(v: unknown): number | undefined {
  const s = asString(v)
  if (s === undefined) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

// --- options (identical shape at shared-network and subnet level) ---------

function parseOptions(raw: unknown): DHCPOptions {
  const root = child(raw, 'option')
  return {
    defaultRouter: asString(child(root, 'default-router')),
    nameServers: asArray(child(root, 'name-server')),
    domainName: asString(child(root, 'domain-name')),
    ntpServers: asArray(child(root, 'ntp-server')),
    domainSearch: asArray(child(root, 'domain-search')),
  }
}

// --- ranges ------------------------------------------------------------------

function parseRanges(subnetRaw: unknown): DHCPRange[] {
  const root = child(subnetRaw, 'range')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(
      ([id, raw]) =>
        ({ id, start: asString(child(raw, 'start')), stop: asString(child(raw, 'stop')) }) satisfies DHCPRange,
    )
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

// --- static mappings -----------------------------------------------------------

function parseStaticMappings(subnetRaw: unknown): DHCPStaticMapping[] {
  const root = child(subnetRaw, 'static-mapping')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(
      ([name, raw]) =>
        ({
          name,
          mac: asString(child(raw, 'mac')),
          duid: asString(child(raw, 'duid')),
          ipAddress: asString(child(raw, 'ip-address')),
        }) satisfies DHCPStaticMapping,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- subnets -------------------------------------------------------------------

function parseSubnets(networkRaw: unknown): DHCPSubnet[] {
  const root = child(networkRaw, 'subnet')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(
      ([cidr, raw]) =>
        ({
          cidr,
          subnetId: asString(child(raw, 'subnet-id')),
          lease: asNumber(child(raw, 'lease')),
          options: parseOptions(raw),
          ranges: parseRanges(raw),
          excludes: asArray(child(raw, 'exclude')),
          staticMappings: parseStaticMappings(raw),
        }) satisfies DHCPSubnet,
    )
    .sort((a, b) => a.cidr.localeCompare(b.cidr))
}

// --- shared networks -------------------------------------------------------------

/** Parses `service dhcp-server shared-network-name` into typed shared
 * networks, each with its subnets nested underneath. `dhcpServer`
 * should be the config subtree rooted at `service dhcp-server` (i.e.
 * the result of `GET /api/config/tree?path=service,dhcp-server`). */
export function parseSharedNetworks(dhcpServer: unknown): DHCPSharedNetwork[] {
  const root = child(dhcpServer, 'shared-network-name')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(
      ([name, raw]) =>
        ({
          name,
          authoritative: isFlagPresent(raw, 'authoritative'),
          options: parseOptions(raw),
          subnets: parseSubnets(raw),
        }) satisfies DHCPSharedNetwork,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- path builders ---------------------------------------------------------------

export function sharedNetworkPath(name: string, ...rest: string[]): string[] {
  return ['service', 'dhcp-server', 'shared-network-name', name, ...rest]
}

export function subnetPath(networkName: string, cidr: string, ...rest: string[]): string[] {
  return sharedNetworkPath(networkName, 'subnet', cidr, ...rest)
}

export function rangePath(networkName: string, cidr: string, rangeId: string, ...rest: string[]): string[] {
  return subnetPath(networkName, cidr, 'range', rangeId, ...rest)
}

export function staticMappingPath(
  networkName: string,
  cidr: string,
  mappingName: string,
  ...rest: string[]
): string[] {
  return subnetPath(networkName, cidr, 'static-mapping', mappingName, ...rest)
}
