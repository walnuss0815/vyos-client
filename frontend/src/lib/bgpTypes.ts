/**
 * Typed, UI-friendly shapes for `protocols bgp` - see bgpParse.ts for
 * the (pure, unit-tested) functions that convert the raw VyOS JSON
 * tree (as returned by GET /api/config/tree?path=protocols,bgp) into
 * these shapes, and back into ConfigOp path arrays for the
 * pending-changes cart.
 *
 * BGP's real option surface is enormous - confirmed against VyOS's
 * own docs (docs.vyos.io/.../protocols/bgp.html): dozens of per-
 * neighbor options alone (capability negotiation, path-attribute
 * manipulation, BFD, TTL security, ADD-PATH, conditional
 * advertisement, ...), plus process-wide tuning (dampening, read-only
 * mode, route reflector/confederation scaling, bestpath selection
 * tuning, ...). This intentionally covers the fields someone
 * configures day-to-day - system AS, router ID, neighbors and peer
 * groups (identity, remote-as, description, password, shutdown/
 * passive, ebgp-multihop, update-source, peer-group assignment, and
 * the most commonly touched per-address-family options), network
 * advertisement, and redistribution - not the full FRR/VyOS surface.
 * Everything else stays fully editable via the Config Tree page - see
 * docs/roadmap.md for the full list of what's deliberately deferred.
 */

export type BGPPeerKind = 'neighbor' | 'peer-group'

export interface BGPAddressFamilySettings {
  nexthopSelf: boolean
  removePrivateAs: boolean
  softReconfigurationInbound: boolean
  maximumPrefix?: string
}

export function blankAddressFamilySettings(): BGPAddressFamilySettings {
  return {
    nexthopSelf: false,
    removePrivateAs: false,
    softReconfigurationInbound: false,
    maximumPrefix: undefined,
  }
}

export interface BGPPeer {
  /** The neighbor's address/interface, or the peer-group's own name -
   * either way, this is the VyOS tag-node identifier. */
  identifier: string
  kind: BGPPeerKind
  /** A raw ASN, or one of 'auto'/'internal'/'external' - VyOS accepts
   * all four as the same `remote-as` leaf's value, not separate
   * mutually-exclusive nodes. */
  remoteAs?: string
  description?: string
  /** Whether a password is currently configured. The real value is
   * never round-tripped: `password` matches shared/sensitive-fields.json,
   * so the backend always masks it before this app ever sees the
   * config tree - see components/bgp/BGPPeerForm.tsx for how this
   * becomes a write-only field, same convention as TreeNode's
   * masked-leaf handling. */
  hasPassword: boolean
  shutdown: boolean
  passive: boolean
  ebgpMultihop?: string
  updateSource?: string
  /** Neighbors only - which peer-group (if any) this neighbor is
   * assigned to and inherits settings from. Not applicable to a
   * peer-group itself. */
  peerGroup?: string
  ipv4Unicast: BGPAddressFamilySettings
  ipv6Unicast: BGPAddressFamilySettings
}

export interface BGPNetworkAdvertisement {
  family: 'ipv4' | 'ipv6'
  prefix: string
}

export const BGP_REDISTRIBUTE_SOURCES_IPV4 = [
  'babel',
  'connected',
  'isis',
  'kernel',
  'nhrp',
  'ospf',
  'rip',
  'static',
] as const
export const BGP_REDISTRIBUTE_SOURCES_IPV6 = [
  'babel',
  'connected',
  'isis',
  'kernel',
  'nhrp',
  'ospfv3',
  'ripng',
  'static',
] as const

export interface BGPRedistribution {
  family: 'ipv4' | 'ipv6'
  source: string
  metric?: string
}

export interface BGPConfig {
  systemAs?: string
  routerId?: string
  neighbors: BGPPeer[]
  peerGroups: BGPPeer[]
  networks: BGPNetworkAdvertisement[]
  redistributions: BGPRedistribution[]
}
