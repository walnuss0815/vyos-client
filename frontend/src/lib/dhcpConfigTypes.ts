/**
 * Typed, UI-friendly shapes for the subset of VyOS's `service
 * dhcp-server` config tree this app has a dedicated form for. See
 * dhcpConfigParse.ts for the (pure, unit-tested) functions that
 * convert the raw VyOS JSON tree (as returned by GET
 * /api/config/tree?path=service,dhcp-server) into these shapes, and
 * back into ConfigOp path arrays for the pending-changes cart.
 *
 * Deliberately not modeled here (still fully editable via the Config
 * Tree page): the long tail of shared-network/subnet DHCP options
 * (bootfile-*, captive-portal, capwap-controller, ip-forwarding,
 * pop/smtp/time/wins/tftp-server, static-route, vendor-option,
 * wpad-url, ...) beyond the 5 covered (default-router, name-server,
 * domain-name, ntp-server, domain-search), dynamic DNS (RFC 2136),
 * High Availability, relay-agent-information/client-class matching,
 * `listen-address`/`hostfile-update`/`log-level`, and DHCPv6 entirely
 * (`service dhcpv6-server` is a separate config tree with its own
 * quirks - prefix delegation, DUID-based mappings - deserving its own
 * pass, deferred the same way PPPoE was for the Interface
 * Configuration UI).
 */

/** The handful of DHCP options this app has dedicated fields for -
 * same shape at both the shared-network level (inherited by every
 * subnet that doesn't override it) and the subnet level. */
export interface DHCPOptions {
  defaultRouter?: string
  nameServers: string[]
  domainName?: string
  ntpServers: string[]
  domainSearch: string[]
}

export interface DHCPRange {
  /** VyOS's range tag - conventionally numeric ("0", "1", ...) but
   * not required to be (client-class examples use names like
   * "otherRange") - treated as an opaque string identifier, the same
   * way VLAN IDs are. */
  id: string
  start?: string
  stop?: string
}

export interface DHCPStaticMapping {
  /** The tag under `static-mapping <name>` - VyOS calls this the
   * mapping's "hostname" in some docs, but it's really just an
   * arbitrary identifier, same role as a firewall zone/group name. */
  name: string
  mac?: string
  duid?: string
  ipAddress?: string
}

export interface DHCPSubnet {
  cidr: string
  /** Required by VyOS and must be unique across every subnet on the
   * server - maps subnets to lease file entries. */
  subnetId?: string
  /** Lease time in seconds; VyOS defaults to 86400 (one day) when unset. */
  lease?: number
  options: DHCPOptions
  ranges: DHCPRange[]
  excludes: string[]
  staticMappings: DHCPStaticMapping[]
}

export interface DHCPSharedNetwork {
  name: string
  authoritative: boolean
  options: DHCPOptions
  subnets: DHCPSubnet[]
}
