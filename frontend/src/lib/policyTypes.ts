/**
 * Typed, UI-friendly shapes for a "broader v1" slice of `policy` - see
 * policyParse.ts for the (pure, unit-tested) functions that convert
 * the raw VyOS JSON tree (as returned by GET
 * /api/config/tree?path=policy) into these shapes, and back into
 * ConfigOp path arrays for the pending-changes cart.
 *
 * Confirmed against docs.vyos.io and, for the fine-grained match/set
 * option nesting `route-map`'s prose docs gloss over, vyos-1x's own
 * interface-definition XML source directly
 * (`interface-definitions/policy.xml.in` and
 * `.../policy_local-route.xml.in`). One correction the XML caught:
 * `policy local-route rule <n> source address` (and `destination
 * address`) is actually a *multi-valued* leaf, not the single value
 * the prose docs' command signature implies.
 *
 * Scoped per explicit product decision made before implementation
 * ("broader v1"):
 *
 * 1. Prefix lists (`policy prefix-list`/`prefix-list6`) - name,
 *    description, rules (action, description, prefix, ge, le).
 *    Complete coverage - PrefixList/PrefixListRule.
 * 2. AS-path, community, extended-community, and large-community
 *    lists - all four share one identical shape in VyOS itself (name,
 *    description, rules with action/description/regex), so they
 *    share one type here too (PolicyList, tagged by `kind`) rather
 *    than four near-duplicate hierarchies - the same "shared shape,
 *    kind-conditional" pattern established by BGP's neighbor/
 *    peer-group split and OSPF's protocol parametrization.
 * 3. Route maps (`policy route-map`) - by far VyOS's largest single
 *    feature (60+ match/set commands). Gets a *curated core*, not
 *    full coverage: rule action/description/call/on-match; match
 *    as-path/community/ip(v6)-prefix-list/protocol/metric/
 *    local-preference/tag; set metric/local-preference/as-path
 *    prepend+exclude/community add+replace+none+delete/origin/tag/
 *    weight. `set community add`/`replace` are technically
 *    multi-valued in VyOS (accepting several community values per
 *    rule) but modeled here as a single value for v1 simplicity -
 *    stacking multiple values on one add/replace stays
 *    Config-Tree-only. Deliberately excluded entirely: extcommunity/
 *    large-community *set* actions (as opposed to the community lists
 *    themselves, which route-maps can still reference by name),
 *    aggregator, atomic-aggregate, originator-id, evpn matching, RPKI
 *    matching, source-vrf matching, ip/ipv6 nexthop matching, ip-next-
 *    hop/ipv6-next-hop/src/distance/table/metric-type setting, peer/
 *    source-peer matching, and jump-to-rule (`continue`) - see this
 *    module's own "Not yet built" note in docs/roadmap.md for the
 *    full list.
 * 4. Local route / local-route6 (`policy local-route`) - policy-based
 *    routing by source/destination address+port, protocol, fwmark,
 *    and inbound-interface, setting the routing table or VRF to use.
 *    A genuinely distinct mechanism from route-maps (it's evaluated
 *    before routing, not as a BGP/redistribution filter).
 *
 * Deliberately Config-Tree-only for now: access-list/access-list6
 * (prefix-lists are the modern, preferred equivalent for most use
 * cases).
 */

export type PolicyListKind = 'as-path' | 'community' | 'extcommunity' | 'large-community'

export interface PolicyListRule {
  number: string
  action?: 'permit' | 'deny'
  description?: string
  regex?: string
}

export interface PolicyList {
  kind: PolicyListKind
  name: string
  description?: string
  rules: PolicyListRule[]
}

export type PrefixListFamily = 'ipv4' | 'ipv6'

export interface PrefixListRule {
  number: string
  action?: 'permit' | 'deny'
  description?: string
  prefix?: string
  ge?: string
  le?: string
}

export interface PrefixList {
  family: PrefixListFamily
  name: string
  description?: string
  rules: PrefixListRule[]
}

export interface RouteMapMatch {
  asPath?: string
  communityList?: string
  communityExactMatch: boolean
  ipPrefixList?: string
  ipv6PrefixList?: string
  protocol?: string
  metric?: string
  localPreference?: string
  tag?: string
}

export function blankRouteMapMatch(): RouteMapMatch {
  return { communityExactMatch: false }
}

export interface RouteMapSet {
  metric?: string
  localPreference?: string
  asPathPrepend?: string
  asPathExclude?: string
  /** See this file's doc comment - modeled as a single value for v1,
   * even though VyOS itself allows several. */
  communityAdd?: string
  communityReplace?: string
  communityNone: boolean
  communityDelete?: string
  origin?: 'igp' | 'egp' | 'incomplete'
  tag?: string
  weight?: string
}

export function blankRouteMapSet(): RouteMapSet {
  return { communityNone: false }
}

export interface RouteMapRule {
  number: string
  action?: 'permit' | 'deny'
  description?: string
  call?: string
  onMatchGoto?: string
  onMatchNext: boolean
  match: RouteMapMatch
  set: RouteMapSet
}

export interface RouteMap {
  name: string
  description?: string
  rules: RouteMapRule[]
}

export type LocalRouteFamily = 'ipv4' | 'ipv6'

export interface LocalRouteRule {
  family: LocalRouteFamily
  number: string
  protocol?: string
  fwmark?: string
  sourceAddresses: string[]
  sourcePort?: string
  destinationAddresses: string[]
  destinationPort?: string
  inboundInterface?: string
  table?: string
  vrf?: string
}

export interface PolicyConfig {
  prefixLists: PrefixList[]
  asPathLists: PolicyList[]
  communityLists: PolicyList[]
  extcommunityLists: PolicyList[]
  largeCommunityLists: PolicyList[]
  routeMaps: RouteMap[]
  localRoutes: LocalRouteRule[]
}
