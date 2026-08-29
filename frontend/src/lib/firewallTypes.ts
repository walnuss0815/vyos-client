/**
 * Typed, UI-friendly shapes for the subset of VyOS's `firewall` config
 * tree this app has dedicated forms for. See firewallParse.ts for the
 * (pure, unit-tested) functions that convert the raw VyOS JSON tree
 * (as returned by GET /api/config/tree?path=firewall) into these
 * shapes, and back into ConfigOp path arrays for the pending-changes
 * cart.
 *
 * Anything not modeled here (geoip matching, dynamic groups, remote
 * groups, per-rule log-options, output/prerouting raw chains, granular
 * connection timeouts, IPv6's own ipv6-address-group/ipv6-network-group
 * *definitions* - see GROUP_TYPES - ...) is still fully editable via
 * the Config Tree page - these types intentionally cover the common
 * case, not every field VyOS's firewall supports.
 */

/** Confirmed against VyOS's own docs (docs.vyos.io/.../firewall/ipv6.html):
 * `firewall ipv6 ...` mirrors `firewall ipv4 ...` almost exactly (base
 * chains, custom `name <name>` chains, every match/action field this
 * app models) with exactly one structural difference at the rule
 * level - ICMP matching is a `icmpv6` node under ipv6 rules, not
 * `icmp` - handled in firewallParse.ts/firewallRuleForm.ts, not part
 * of this type (FirewallRule.icmpTypeName is deliberately
 * family-agnostic at the UI-type level). */
export type FirewallFamily = 'ipv4' | 'ipv6'
export const FIREWALL_FAMILIES: readonly FirewallFamily[] = ['ipv4', 'ipv6']

export const BASE_CHAINS = ['forward', 'input', 'output'] as const
export type BaseChain = (typeof BASE_CHAINS)[number]

export const GROUP_TYPES = [
  'address-group',
  'network-group',
  'port-group',
  'interface-group',
  'mac-group',
  'domain-group',
] as const
export type GroupType = (typeof GROUP_TYPES)[number]

/** The VyOS leaf name each group type stores its members under. */
export const GROUP_MEMBER_LEAF: Record<GroupType, string> = {
  'address-group': 'address',
  'network-group': 'network',
  'port-group': 'port',
  'interface-group': 'interface',
  'mac-group': 'mac-address',
  'domain-group': 'address',
}

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  'address-group': 'Address groups',
  'network-group': 'Network groups',
  'port-group': 'Port groups',
  'interface-group': 'Interface groups',
  'mac-group': 'MAC groups',
  'domain-group': 'Domain groups',
}

export interface FirewallGroup {
  type: GroupType
  name: string
  description?: string
  members: string[]
}

export interface FirewallZone {
  name: string
  description?: string
  localZone: boolean
  interfaces: string[]
  defaultAction?: string
  defaultLog: boolean
  /** source zone name -> ruleset name applied for traffic from that zone */
  from: Record<string, string>
}

export type RuleAction =
  | 'accept'
  | 'continue'
  | 'drop'
  | 'jump'
  | 'queue'
  | 'reject'
  | 'return'
  | 'synproxy'

export interface FirewallMatch {
  address?: string
  port?: string
  addressGroup?: string
  networkGroup?: string
  portGroup?: string
  macGroup?: string
  domainGroup?: string
  macAddress?: string
}

export interface FirewallRule {
  number: string
  action?: RuleAction
  jumpTarget?: string
  protocol?: string
  description?: string
  disabled: boolean
  log: boolean
  source: FirewallMatch
  destination: FirewallMatch
  inboundInterface?: string
  outboundInterface?: string
  icmpTypeName?: string
}

export interface FirewallRuleset {
  /** "forward" | "input" | "output" for a base chain, or the custom
   * chain's own name (from `firewall <family> name <name>`). */
  id: string
  kind: 'base' | 'custom'
  /** ipv4/ipv6 are genuinely separate rulesets in VyOS's config tree
   * (`firewall ipv4 forward filter` vs `firewall ipv6 forward
   * filter`, and likewise for custom `name <name>` chains) - a base
   * chain or custom name can exist under one family, the other, or
   * both simultaneously as unrelated rulesets that just happen to
   * share an id. */
  family: FirewallFamily
  defaultAction?: string
  description?: string
  rules: FirewallRule[]
}

export interface FirewallGlobalOptions {
  allPing?: 'enable' | 'disable'
  broadcastPing?: 'enable' | 'disable'
  synCookies?: 'enable' | 'disable'
  logMartians?: 'enable' | 'disable'
  ipSrcRoute?: 'enable' | 'disable'
  stateInvalidAction?: string
  stateEstablishedAction?: string
  stateRelatedAction?: string
}
