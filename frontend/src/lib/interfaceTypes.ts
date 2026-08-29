/**
 * Typed, UI-friendly shapes for the subset of VyOS's `interfaces` (and
 * `vrf`) config tree this app has dedicated forms for: Ethernet,
 * Bonding, and Bridge interfaces, their VLAN (802.1q `vif`)
 * sub-interfaces, and VRF instances. See interfaceParse.ts for the
 * (pure, unit-tested) functions that convert the raw VyOS JSON tree
 * (as returned by GET /api/config/tree?path=interfaces or path=vrf)
 * into these shapes, and back into ConfigOp path arrays for the
 * pending-changes cart.
 *
 * Deliberately not modeled here (still fully editable via the Config
 * Tree page): PPPoE, WireGuard, wireless/WWAN, tunnel/VXLAN/GENEVE
 * interfaces, 802.1X (EAPOL), ethtool-level tuning (duplex/speed/
 * offload/interrupt-coalescing/ring-buffer), DHCP(v6) client options,
 * IPv6 SLAAC/EUI-64 addressing, EVPN multihoming, and per-VRF routing
 * integration (route-maps, `ip nht`, VRF-scoped services) - these
 * types intentionally cover the common case (addressing, description,
 * MTU, VRF assignment, VLANs, and each type's own defining feature -
 * bonding members/mode, bridge members/STP/VLAN-awareness), not every
 * field VyOS's interface config supports.
 *
 * Ethernet interfaces are physical - this app never "creates" one,
 * only edits the config of interfaces the router already has (cross-
 * referenced against the live/operational interface list - see
 * hooks/useInterfaces.ts). Bonding and Bridge interfaces are virtual
 * and are genuinely created/deleted through this UI, like firewall
 * zones/rulesets/groups are.
 */

/** A VLAN (802.1q) sub-interface, nested under an Ethernet, Bonding,
 * or Bridge interface via `vif <vlan-id>`. Same editable field set as
 * its parent, minus the parent-type-specific fields (mode/members/
 * STP/...). */
export interface InterfaceVlan {
  vlanId: string
  description?: string
  disabled: boolean
  mac?: string
  mtu?: number
  /** Each entry is a CIDR (`192.0.2.1/24`, `2001:db8::1/64`) or the
   * literal `dhcp`/`dhcpv6` - VyOS's `address` leaf is multi-valued
   * and accepts either. */
  addresses: string[]
  vrf?: string
}

export interface EthernetInterface {
  name: string
  description?: string
  disabled: boolean
  mac?: string
  mtu?: number
  addresses: string[]
  vrf?: string
  vlans: InterfaceVlan[]
}

export const BOND_MODES = [
  '802.3ad',
  'active-backup',
  'broadcast',
  'round-robin',
  'transmit-load-balance',
  'adaptive-load-balance',
  'xor-hash',
] as const
export type BondMode = (typeof BOND_MODES)[number]

export const BOND_HASH_POLICIES = ['layer2', 'layer2+3', 'layer3+4'] as const
export type BondHashPolicy = (typeof BOND_HASH_POLICIES)[number]

export const BOND_LACP_RATES = ['slow', 'fast'] as const
export type BondLacpRate = (typeof BOND_LACP_RATES)[number]

export interface BondInterface {
  name: string
  description?: string
  disabled: boolean
  mac?: string
  mtu?: number
  addresses: string[]
  vrf?: string
  mode: BondMode
  hashPolicy?: BondHashPolicy
  /** Preferred active member - only meaningful in active-backup,
   * transmit-load-balance, or adaptive-load-balance modes. */
  primary?: string
  /** 802.3ad mode only. */
  lacpRate?: BondLacpRate
  /** 802.3ad mode only. */
  minLinks?: number
  members: string[]
  vlans: InterfaceVlan[]
}

export const BRIDGE_VLAN_PROTOCOLS = ['802.1q', '802.1ad'] as const
export type BridgeVlanProtocol = (typeof BRIDGE_VLAN_PROTOCOLS)[number]

export interface BridgeMember {
  name: string
  /** STP port priority - lower is preferred. */
  priority?: number
  /** STP path cost - lower is preferred. */
  cost?: number
}

export interface BridgeInterface {
  name: string
  description?: string
  disabled: boolean
  mac?: string
  mtu?: number
  addresses: string[]
  vrf?: string
  stp: boolean
  vlanAware: boolean
  /** Only meaningful when vlanAware is true. Defaults to 802.1q on
   * VyOS if unset. */
  vlanProtocol?: BridgeVlanProtocol
  members: BridgeMember[]
  vlans: InterfaceVlan[]
}

/** A VRF instance (`vrf name <name> table <id>`). VyOS documents no
 * other base attributes for a VRF itself beyond its (mandatory,
 * immutable-once-set) routing table ID - everything else under `vrf
 * name <name>` (route-maps, `ip nht`, VRF-scoped services) is routing-
 * integration territory, out of scope here. */
export interface Vrf {
  name: string
  table: string
}
