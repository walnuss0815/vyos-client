/**
 * Typed, UI-friendly shapes for VyOS's `high-availability vrrp` (VRRP
 * groups/sync-groups) and the separate `service conntrack-sync` config
 * tree - genuinely distinct VyOS features, linked only by one
 * cross-reference field (conntrack-sync's `failover-mechanism vrrp
 * sync-group`), confirmed directly against vyos-1x's
 * interface-definitions/high-availability.xml.in and
 * service_conntrack-sync.xml.in. See haParse.ts for the raw VyOS JSON
 * -> these shapes conversion, and haVrrpForm.ts/haConntrackSyncForm.ts
 * for the reverse (form values -> ConfigOp path arrays).
 *
 * `high-availability` also contains a `virtual-server` node (an
 * unrelated IPVS/LVS load balancer, a different backend than VRRP)
 * that is deliberately NOT modeled here - see docs/roadmap.md's
 * "Not yet built" note for this area.
 *
 * Not modeled (still fully editable via Config Tree): per-group/
 * per-sync-group GARP (gratuitous ARP) timing overrides - only the
 * global `vrrp global-parameters garp` defaults are exposed, since
 * per-item overrides are rarely touched in practice and every field
 * already has a sane VyOS-side default.
 */

export interface VRRPHealthCheck {
  failureCount: number // default 3
  interval: number // default 60 (seconds)
  ping?: string
  script?: string
  timeout?: number
}

export interface VRRPTransitionScripts {
  master?: string
  backup?: string
  fault?: string
  stop?: string
}

export interface VRRPAddress {
  address: string
  /** Only set when the virtual address is assigned to a different
   * interface than the group's own `interface`. */
  interface?: string
}

export interface VRRPGroup {
  name: string
  interface?: string
  vrid?: string
  priority: number // default 100
  advertiseInterval: number // default 1
  description?: string
  disabled: boolean
  noPreempt: boolean
  preemptDelay: number // default 0
  rfc3768Compatibility: boolean
  helloSourceAddress?: string
  peerAddresses: string[]
  authenticationPassword?: string
  authenticationType?: string // 'plaintext-password' | 'ah'
  healthCheck?: VRRPHealthCheck
  excludeVrrpInterface: boolean
  trackInterfaces: string[]
  transitionScripts: VRRPTransitionScripts
  addresses: VRRPAddress[]
  excludedAddresses: VRRPAddress[]
}

export interface VRRPSyncGroup {
  name: string
  members: string[]
  healthCheck?: VRRPHealthCheck
  transitionScripts: VRRPTransitionScripts
}

export interface VRRPGarpSettings {
  interval: string // default "0" (can be fractional, e.g. "0.5")
  masterDelay: number // default 5
  masterRefresh: number // default 5
  masterRefreshRepeat: number // default 1
  masterRepeat: number // default 5
}

export interface VRRPGlobalSettings {
  snmpTrap: boolean
  startupDelay?: number
  version?: string // '2' | '3' (IPv6 groups always use 3 regardless)
  garp: VRRPGarpSettings
}

export interface HAConfig {
  /** `high-availability disable` - turns off VRRP (and virtual-server)
   * entirely, distinct from disabling one specific group. */
  disabled: boolean
  global: VRRPGlobalSettings
  groups: VRRPGroup[]
  syncGroups: VRRPSyncGroup[]
}

export const CONNTRACK_SYNC_ACCEPT_PROTOCOLS = ['tcp', 'udp', 'icmp', 'icmp6', 'sctp', 'dccp'] as const
export const CONNTRACK_SYNC_EXPECT_SYNC_PROTOCOLS = ['all', 'ftp', 'sip', 'h323', 'nfs', 'sqlnet'] as const

export interface ConntrackSyncInterface {
  name: string
  peer?: string
  port?: number
}

export interface ConntrackSyncConfig {
  acceptProtocols: string[]
  disableExternalCache: boolean
  disableSyslog: boolean
  eventListenQueueSize: number // default 8
  expectSync: string[]
  startupResync: boolean
  /** `failover-mechanism vrrp sync-group <name>` - the only failover
   * mechanism VyOS actually implements today (the config tree's node
   * shape suggests others were anticipated, but none exist), and a
   * required cross-reference to an existing `high-availability vrrp
   * sync-group` - VyOS's own conf-mode script raises a ConfigError if
   * the referenced sync-group doesn't exist. */
  vrrpSyncGroup?: string
  ignoreAddresses: string[]
  interfaces: ConntrackSyncInterface[]
  listenAddresses: string[]
  mcastGroup: string // default "225.0.0.50"
  syncQueueSize: number // default 1
  purgeTimeout: number // default 60
}
