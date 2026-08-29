/**
 * Typed, UI-friendly shapes for a curated core of `service
 * dhcpv6-server`. Confirmed against vyos-1x's own interface-definition
 * XML source (`interface-definitions/include/dhcp/
 * dhcpv6-server-common-config.xml.i`, the shared include mounted
 * directly under `service dhcpv6-server`).
 *
 * Deliberately NOT modeled after the existing IPv4 DHCP server module
 * (dhcpConfigTypes.ts) despite the conceptual overlap - the two
 * services have genuinely different shapes for what look like the
 * same concepts: DHCPv6's `static-mapping` is keyed by an arbitrary
 * hostname (with optional `mac`/`duid` match children) rather than by
 * MAC directly, `range` is keyed by name with its own `prefix`/
 * `start`/`stop` triple rather than a bare start-stop pair, and
 * `prefix-delegation` (IA-PD-like behavior) has no IPv4 equivalent at
 * all.
 *
 * Scoped to a curated core, not full coverage:
 * - Global: `listen-interface`, `disable-route-autoinstall`,
 *   `preference`, `log-level`, `global-parameters name-server`.
 * - `shared-network-name <name>`: `disable`, `description`,
 *   `interface`, and its `subnet <prefix>` children.
 * - `subnet <prefix>`: `interface`, `subnet-id`, `lease-time`
 *   (default/maximum/minimum), `range <name>` (prefix/start/stop),
 *   `static-mapping <hostname>` (mac/duid/ipv6-address/ipv6-prefix/
 *   disable), `prefix-delegation prefix <addr>` (prefix-length/
 *   delegated-length/excluded-prefix/excluded-prefix-length).
 * - The shared `option` node (reused at 4 depths in VyOS's own
 *   schema) is modeled here as `DHCPv6Option`, but only mounted at the
 *   `shared-network-name` and `subnet` levels (not `range` or
 *   `static-mapping`, both narrower/rarer use cases) - and only its
 *   `name-server`/`domain-search`/`sntp-server` fields, not
 *   `captive-portal`/`capwap-controller`/`nis*`/`sip-server`/
 *   `info-refresh-time`/`time-zone`/`vendor-option` (all niche).
 *
 * Note: `prefix-delegation prefix <key>` is validated by VyOS as a
 * bare `ipv6-address` (no `/len` suffix) - the length is a separate
 * `prefix-length` child, not part of the key. Also note two
 * label/constraint mismatches upstream (confirmed against the actual
 * enforced `<constraint>`, not the possibly-stale `<valueHelp>` text):
 * `delegated-length` accepts 32-96 (not 32-64 as its help text says),
 * `excluded-prefix-length` accepts 33-128 (not 33-64).
 */

export const DHCPV6_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug'] as const

export interface DHCPv6Option {
  nameServers: string[]
  domainSearch: string[]
  sntpServers: string[]
}

export function blankDHCPv6Option(): DHCPv6Option {
  return { nameServers: [], domainSearch: [], sntpServers: [] }
}

export interface DHCPv6Range {
  /** The tag under `range <name>` - an arbitrary identifier, same
   * role as a DHCPv4 range's numeric id. */
  id: string
  prefix?: string
  start?: string
  stop?: string
}

export interface DHCPv6PrefixDelegation {
  /** The tag under `prefix-delegation prefix <addr>` - a bare IPv6
   * address, not a CIDR (see this file's doc comment). */
  prefix: string
  prefixLength?: string
  delegatedLength?: string
  excludedPrefix?: string
  excludedPrefixLength?: string
}

export interface DHCPv6StaticMapping {
  /** The tag under `static-mapping <hostname>` - an fqdn-validated
   * identifier, NOT the MAC/DUID itself (those are optional match
   * children below). */
  hostname: string
  disabled: boolean
  mac?: string
  duid?: string
  ipv6Addresses: string[]
  ipv6Prefixes: string[]
}

export interface DHCPv6Subnet {
  cidr: string
  interface?: string
  subnetId?: string
  leaseDefault?: string
  leaseMaximum?: string
  leaseMinimum?: string
  option: DHCPv6Option
  ranges: DHCPv6Range[]
  staticMappings: DHCPv6StaticMapping[]
  prefixDelegations: DHCPv6PrefixDelegation[]
}

export function blankDHCPv6Subnet(): Omit<DHCPv6Subnet, 'cidr'> {
  return { option: blankDHCPv6Option(), ranges: [], staticMappings: [], prefixDelegations: [] }
}

export interface DHCPv6SharedNetwork {
  name: string
  disabled: boolean
  description?: string
  interface?: string
  option: DHCPv6Option
  subnets: DHCPv6Subnet[]
}

export function blankDHCPv6SharedNetwork(): Omit<DHCPv6SharedNetwork, 'name'> {
  return { disabled: false, option: blankDHCPv6Option(), subnets: [] }
}

export interface DHCPv6ServerConfig {
  /** Whether `service dhcpv6-server` exists at all in the tree. */
  enabled: boolean
  disabled: boolean
  listenInterfaces: string[]
  disableRouteAutoinstall: boolean
  preference?: string
  logLevel?: string
  globalNameServers: string[]
  sharedNetworks: DHCPv6SharedNetwork[]
}

export function blankDHCPv6ServerConfig(): DHCPv6ServerConfig {
  return {
    enabled: false,
    disabled: false,
    listenInterfaces: [],
    disableRouteAutoinstall: false,
    globalNameServers: [],
    sharedNetworks: [],
  }
}
