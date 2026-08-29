/**
 * Typed, UI-friendly shapes for `nat` (NAT44 only) - see natParse.ts
 * for the (pure, unit-tested) functions that convert the raw VyOS
 * JSON tree (as returned by GET /api/config/tree?path=nat) into these
 * shapes, and back into ConfigOp path arrays for the pending-changes
 * cart.
 *
 * Confirmed against docs.vyos.io and vyos-1x's own interface-
 * definition XML source (`interface-definitions/nat.xml.in` and its
 * `include/nat-*.xml.i`/`include/firewall/*.xml.i` includes). NAT44
 * rule matching turned out to reuse the *exact* same source/
 * destination address+port+group shape as Firewall rules
 * (firewallTypes.ts's FirewallMatch) - VyOS's nftables-based NAT and
 * Firewall implementations share this matching vocabulary - so
 * NATMatch deliberately mirrors it (address, port, addressGroup,
 * networkGroup, portGroup), including reusing the *same* underlying
 * `firewall group address-group|network-group|port-group` groups
 * this app's Firewall UI already manages.
 *
 * `nat source`/`nat destination` rules share one type (NATRule,
 * tagged by `kind`) since - other than interface direction and a
 * couple of kind-specific translation details (masquerade only makes
 * sense for source; redirect-to-localhost only for destination) -
 * their schemas are otherwise identical. `nat static` (1-to-1 NAT) is
 * a materially simpler, separate feature (a single destination
 * address maps to a single translation address, no port/protocol/
 * group matching at all) and gets its own type, NATStaticRule.
 *
 * Scoped to a "broader v1" per explicit product decision made before
 * implementation: source, destination, and static rules, each with
 * description, interface (name only, not VyOS's separate
 * interface-group feature), protocol, source/destination address +
 * port + address-group/network-group/port-group matching (MAC-group
 * and FQDN matching deliberately excluded, unlike Firewall - a
 * narrower cut than Firewall's own match-field scope), translation
 * address/port (or 'masquerade' for source, or redirect-port for
 * destination), and the disable/exclude/log flags. Deliberately
 * Config-Tree-only for now: NAT64, NAT66/NPTv6, CGNAT (IPv6-
 * transition/carrier-scale features, not relevant to a typical VyOS
 * deployment), translation options (address-mapping/port-mapping
 * randomization), and packet-type matching. ("load-balancing
 * backends" - HAProxy's own concept, unrelated to `nat` - used to be
 * listed here too, back when neither had any UI; see
 * loadBalancingTypes.ts now.)
 */

export type NATRuleKind = 'source' | 'destination'

export interface NATMatch {
  address?: string
  port?: string
  addressGroup?: string
  networkGroup?: string
  portGroup?: string
}

export function blankNATMatch(): NATMatch {
  return {}
}

export interface NATRule {
  kind: NATRuleKind
  /** The tag-node identifier - VyOS's own rule number. */
  number: string
  description?: string
  /** `outbound-interface name` for source rules, `inbound-interface
   * name` for destination rules - both just the interface name, not
   * VyOS's separate interface-group matching. */
  interfaceName?: string
  protocol?: string
  source: NATMatch
  destination: NATMatch
  /** Source rules only: an address/prefix/range, or the literal
   * string 'masquerade' (use the outbound interface's own address). */
  translationAddress?: string
  translationPort?: string
  /** Destination rules only - `translation redirect port <n>`,
   * VyOS's shorthand for "always redirect to the router itself". */
  redirectPort?: string
  disabled: boolean
  exclude: boolean
  log: boolean
}

export interface NATStaticRule {
  number: string
  description?: string
  destinationAddress?: string
  /** `inbound-interface` - a plain leaf for static rules (unlike
   * source/destination rules' interface *node* with its own
   * name/group children), so this is the whole value, not just a
   * name sub-field. */
  interfaceName?: string
  translationAddress?: string
  log: boolean
}

export interface NATConfig {
  sourceRules: NATRule[]
  destinationRules: NATRule[]
  staticRules: NATStaticRule[]
}
