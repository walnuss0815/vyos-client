/**
 * Typed, UI-friendly shapes for `protocols ospf` (OSPFv2/IPv4) and
 * `protocols ospfv3` (OSPFv3/IPv6) - see ospfParse.ts for the (pure,
 * unit-tested) functions that convert the raw VyOS JSON tree (as
 * returned by GET /api/config/tree?path=protocols,ospf[v3]) into
 * these shapes, and back into ConfigOp path arrays for the
 * pending-changes cart.
 *
 * OSPFv2 and OSPFv3 are genuinely separate FRR daemons/processes in
 * VyOS (unlike BGP's ipv4-unicast/ipv6-unicast, which are two address
 * families of one process) - confirmed against both docs.vyos.io and
 * vyos-1x's own interface-definition XML source
 * (interface-definitions/include/ospf/ and .../ospfv3/), which is
 * authoritative where the prose docs were ambiguous or stale (e.g.
 * OSPFv3 area-type stub/nssa *does* exist despite the prose docs page
 * not mentioning it; OSPFv3 interface cost is a plain `cost` leaf,
 * not `ipv6 cost` as the prose docs claimed).
 *
 * Their schemas overlap heavily (areas, interfaces, redistribution,
 * router-id, auto-cost, default-information) but aren't identical -
 * OSPFv2 has area/interface authentication, NSSA translate role, and
 * area range cost/substitute that OSPFv3 lacks; OSPFv3's NSSA areas
 * have a default-information-originate flag OSPFv2's don't. Rather
 * than two near-duplicate type hierarchies, one shared shape is used
 * per entity (mirroring bgpTypes.ts's BGPPeer, which already has a
 * neighbor-only `peerGroup` field), tagged with `protocol` and with
 * protocol-inapplicable fields simply left undefined/false. Parsers,
 * forms, and list/card UI are all shared between the two protocols;
 * only field visibility and available options differ, driven by
 * `protocol`.
 *
 * This is a "solid v1" scoped per explicit product decision: areas
 * (network enablement, stub/NSSA area types, ranges, authentication
 * type), interfaces (area assignment, cost/priority/timers, passive,
 * network type, mtu-ignore, BFD toggle, authentication), global
 * settings (router-id, auto-cost reference-bandwidth, distance,
 * default-information originate, default-metric), and redistribution.
 * Deliberately Config-Tree-only for now: virtual-links, segment
 * routing, MPLS-TE, static NBMA neighbors, LDP-sync, ABR
 * shortcut/rfc1583-compatibility/abr-type tuning, graceful restart,
 * max-metric router-lsa, export/import-list (Policy ACL references -
 * Policy itself doesn't exist in this app yet), external route
 * summarization (aggregation/summary-address), refresh/SPF-throttle
 * timers, log-adjacency-changes, VRF table redistribution, the
 * `passive-interface default` global toggle and its per-interface
 * `disable` exclusion (this app's interface `passive` is modeled as a
 * plain per-interface flag instead), and retransmit-interval/
 * retransmit-window (long-tail timer tuning). See docs/roadmap.md for
 * the full list.
 */

export type OSPFProtocol = 'ospf' | 'ospfv3'

export type OSPFAreaType = 'stub' | 'nssa'

export interface OSPFAreaRange {
  prefix: string
  notAdvertise: boolean
  /** OSPFv2 only - OSPFv3 area ranges don't carry an aggregated cost. */
  cost?: string
  /** OSPFv2 only. */
  substitute?: string
}

export interface OSPFArea {
  /** The area's tag-node identifier - a decimal number or a
   * dotted-decimal (IPv4-address-shaped) area ID, both valid per
   * VyOS. Kept as a string; not parsed/normalized further. */
  id: string
  /** OSPFv2 only - `area <id> network <cidr>` is how OSPFv2 enables
   * itself on interfaces whose address falls within the given
   * prefix. OSPFv3 has no area-level network statement; it's always
   * enabled per-interface (see OSPFInterface.area). */
  networks: string[]
  /** undefined = normal (the default) area. */
  areaType?: OSPFAreaType
  /** stub/nssa "totally stubby" flag - same leaf name
   * (`no-summary`) under either area-type. */
  noSummary: boolean
  /** stub/nssa summary-default LSA cost. */
  defaultCost?: string
  /** OSPFv2 NSSA areas only - which role this NSSA border router
   * takes in Type-7-to-Type-5 LSA translation. */
  nssaTranslate?: 'always' | 'candidate' | 'never'
  /** OSPFv3 NSSA areas only. */
  nssaDefaultInformationOriginate: boolean
  /** OSPFv2 only - the *type* of area-wide authentication. The
   * actual keying material (plaintext password / MD5 key) is
   * configured per-interface, not here - see OSPFInterface. */
  authentication?: 'plaintext-password' | 'md5'
  ranges: OSPFAreaRange[]
}

export type OSPFInterfaceAuthMode = 'plaintext-password' | 'md5' | 'null'

export interface OSPFInterface {
  /** The tag-node identifier - an interface name. */
  name: string
  area?: string
  cost?: string
  priority?: string
  deadInterval?: string
  helloInterval?: string
  passive: boolean
  /** OSPFv2 offers broadcast/non-broadcast/point-to-multipoint/
   * point-to-point; OSPFv3 only broadcast/point-to-point - see
   * OSPF_NETWORK_TYPES_BY_PROTOCOL. */
  networkType?: string
  mtuIgnore: boolean
  bfd: boolean
  /** OSPFv2 only. `null` explicitly disables authentication
   * inherited from the area (a real, if uncommon, VyOS option - kept
   * since it's a single flag, cheap to support alongside the other
   * two modes). */
  authMode?: OSPFInterfaceAuthMode
  /** Whether a plaintext password is currently configured
   * (authMode === 'plaintext-password'). Write-only, like every
   * other masked leaf in this app - see BGPPeer.hasPassword's doc
   * comment for the general convention this follows. */
  hasPlaintextPassword: boolean
  /** OSPFv2 MD5 auth only. VyOS models `md5 key-id <id> md5-key
   * <text>` as a tag node, technically allowing several concurrent
   * key-ids (useful for key rollovers) - this app's v1 only supports
   * a single active key-id per interface (the overwhelmingly common
   * case) and shows the first one found if more exist; managing a
   * true multi-key rollover stays Config-Tree-only. */
  md5KeyId?: string
  /** Whether a key is currently set for md5KeyId. Write-only. */
  hasMd5Key: boolean
}

export const OSPF_NETWORK_TYPES_BY_PROTOCOL: Record<OSPFProtocol, readonly string[]> = {
  ospf: ['broadcast', 'non-broadcast', 'point-to-multipoint', 'point-to-point'],
  ospfv3: ['broadcast', 'point-to-point'],
}

/** `protocols ospf redistribute <source>` - confirmed against
 * vyos-1x's interface-definitions XML (the prose docs only mention
 * "five modes" and don't enumerate isis/babel, which do exist in the
 * schema). Deliberately excludes the `table` tagNode (VRF route-table
 * redistribution - a niche, separate feature). */
export const OSPF_REDISTRIBUTE_SOURCES = [
  'babel',
  'bgp',
  'connected',
  'isis',
  'kernel',
  'nhrp',
  'rip',
  'static',
] as const

/** `protocols ospfv3 redistribute <source>` - OSPFv3 has no `nhrp`
 * source and uses `ripng` instead of `rip`, confirmed against the
 * XML source the same way as OSPF_REDISTRIBUTE_SOURCES. */
export const OSPFV3_REDISTRIBUTE_SOURCES = [
  'babel',
  'bgp',
  'connected',
  'isis',
  'kernel',
  'ripng',
  'static',
] as const

export interface OSPFRedistribution {
  source: string
  metric?: string
  metricType?: '1' | '2'
}

export interface OSPFGlobalSettings {
  routerId?: string
  autoCostReferenceBandwidth?: string
  distanceGlobal?: string
  distanceExternal?: string
  distanceInterArea?: string
  distanceIntraArea?: string
  defaultInformationOriginateAlways: boolean
  defaultInformationOriginateMetric?: string
  defaultInformationOriginateMetricType?: '1' | '2'
  /** OSPFv2 only - the default metric applied to redistributed
   * routes that don't specify their own. OSPFv3's schema has no
   * equivalent top-level `default-metric` leaf. */
  defaultMetric?: string
}

export function blankGlobalSettings(): OSPFGlobalSettings {
  return { defaultInformationOriginateAlways: false }
}

export interface OSPFProcessConfig {
  global: OSPFGlobalSettings
  areas: OSPFArea[]
  interfaces: OSPFInterface[]
  redistributions: OSPFRedistribution[]
}

export function blankProcessConfig(): OSPFProcessConfig {
  return { global: blankGlobalSettings(), areas: [], interfaces: [], redistributions: [] }
}

export interface OSPFConfig {
  ospf: OSPFProcessConfig
  ospfv3: OSPFProcessConfig
}
