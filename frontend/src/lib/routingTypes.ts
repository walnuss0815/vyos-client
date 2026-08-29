/**
 * Typed, UI-friendly shapes for `protocols static` (static routes) -
 * see routingParse.ts for the (pure, unit-tested) functions that
 * convert the raw VyOS JSON tree (as returned by GET
 * /api/config/tree?path=protocols,static) into these shapes, and back
 * into ConfigOp path arrays for the pending-changes cart.
 *
 * Confirmed against VyOS's own docs
 * (docs.vyos.io/.../protocols/static.html): `route <subnet>` and
 * `route6 <subnet>` (family-specific top-level tag nodes, not a single
 * `route` node with a family field) share an identical shape - a
 * destination subnet can have any combination of next-hop entries
 * (each its own tag node keyed by address, with its own
 * distance/disable), interface entries (same shape, keyed by
 * interface name instead), dhcp-interface leaves (interface name
 * only, no distance/disable), and/or a single reject or blackhole
 * flag-node (distance + tag, not keyed by a value - unlike next-hop/
 * interface, there's only ever one reject and one blackhole per
 * destination).
 *
 * Deliberately not modeled: BFD monitoring (`next-hop <addr> bfd
 * [profile <name>] [multi-hop source-address <addr>]`) and IPv6-only
 * SRv6 segment routing (`next-hop/interface <..> segments <..>`) -
 * long-tail/specialized features, still fully editable via the Config
 * Tree page, same scoping precedent as Firewall's geoip matching or
 * Interfaces' ethtool tuning.
 */

export type RouteFamily = 'ipv4' | 'ipv6'

export interface StaticRouteNextHop {
  address: string
  disabled: boolean
  distance?: string
}

export interface StaticRouteInterface {
  interfaceName: string
  disabled: boolean
  distance?: string
}

export interface StaticRouteRejectOrBlackhole {
  distance?: string
  tag?: string
}

export interface StaticRoute {
  family: RouteFamily
  /** The destination subnet in CIDR notation (e.g. "192.0.2.0/24"),
   * or the default-route shorthand ("0.0.0.0/0" / "::/0") - this is
   * the tag value of `route`/`route6`, so it's also this route's
   * stable identifier within its family. */
  destination: string
  nextHops: StaticRouteNextHop[]
  interfaces: StaticRouteInterface[]
  /** `dhcp-interface <name>` - a plain (possibly multi-valued) leaf,
   * unlike next-hop/interface which are tag nodes with their own
   * distance/disable children. */
  dhcpInterfaces: string[]
  reject?: StaticRouteRejectOrBlackhole
  blackhole?: StaticRouteRejectOrBlackhole
}
