import {
  blankRouteMapMatch,
  blankRouteMapSet,
  type LocalRouteFamily,
  type LocalRouteRule,
  type PolicyConfig,
  type PolicyList,
  type PolicyListKind,
  type PolicyListRule,
  type PrefixList,
  type PrefixListFamily,
  type PrefixListRule,
  type RouteMap,
  type RouteMapRule,
} from './policyTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/ospfParse.ts's/
// systemParse.ts's/natParse.ts's own copy of this comment for why this
// matches the rest of the codebase.)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') return [v]
  return []
}

// --- prefix lists --------------------------------------------------------

function parsePrefixListRule(number: string, raw: unknown): PrefixListRule {
  return {
    number,
    action: asString(child(raw, 'action')) as 'permit' | 'deny' | undefined,
    description: asString(child(raw, 'description')),
    prefix: asString(child(raw, 'prefix')),
    ge: asString(child(raw, 'ge')),
    le: asString(child(raw, 'le')),
  }
}

function parsePrefixLists(family: PrefixListFamily, root: unknown): PrefixList[] {
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([name, raw]) => {
      const ruleRoot = child(raw, 'rule')
      const rules = isRecord(ruleRoot)
        ? Object.entries(ruleRoot)
            .map(([number, r]) => parsePrefixListRule(number, r))
            .sort((a, b) => Number(a.number) - Number(b.number))
        : []
      return { family, name, description: asString(child(raw, 'description')), rules }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- as-path/community/extcommunity/large-community lists ----------------

function parsePolicyListRule(number: string, raw: unknown): PolicyListRule {
  return {
    number,
    action: asString(child(raw, 'action')) as 'permit' | 'deny' | undefined,
    description: asString(child(raw, 'description')),
    regex: asString(child(raw, 'regex')),
  }
}

function parsePolicyLists(kind: PolicyListKind, root: unknown): PolicyList[] {
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([name, raw]) => {
      const ruleRoot = child(raw, 'rule')
      const rules = isRecord(ruleRoot)
        ? Object.entries(ruleRoot)
            .map(([number, r]) => parsePolicyListRule(number, r))
            .sort((a, b) => Number(a.number) - Number(b.number))
        : []
      return { kind, name, description: asString(child(raw, 'description')), rules }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- route maps ----------------------------------------------------------

function parseRouteMapMatch(raw: unknown): RouteMapRule['match'] {
  const communityRoot = child(raw, 'community')
  return {
    ...blankRouteMapMatch(),
    asPath: asString(child(raw, 'as-path')),
    communityList: asString(child(communityRoot, 'community-list')),
    communityExactMatch: isFlagPresent(communityRoot, 'exact-match'),
    ipPrefixList: asString(child(child(child(raw, 'ip'), 'address'), 'prefix-list')),
    ipv6PrefixList: asString(child(child(child(raw, 'ipv6'), 'address'), 'prefix-list')),
    protocol: asString(child(raw, 'protocol')),
    metric: asString(child(raw, 'metric')),
    localPreference: asString(child(raw, 'local-preference')),
    tag: asString(child(raw, 'tag')),
  }
}

function parseRouteMapSet(raw: unknown): RouteMapRule['set'] {
  const asPathRoot = child(raw, 'as-path')
  const communityRoot = child(raw, 'community')
  return {
    ...blankRouteMapSet(),
    metric: asString(child(raw, 'metric')),
    localPreference: asString(child(raw, 'local-preference')),
    asPathPrepend: asString(child(asPathRoot, 'prepend')),
    asPathExclude: asString(child(asPathRoot, 'exclude')),
    communityAdd: asStringArray(child(communityRoot, 'add'))[0],
    communityReplace: asStringArray(child(communityRoot, 'replace'))[0],
    communityNone: isFlagPresent(communityRoot, 'none'),
    communityDelete: asString(child(communityRoot, 'delete')),
    origin: asString(child(raw, 'origin')) as 'igp' | 'egp' | 'incomplete' | undefined,
    tag: asString(child(raw, 'tag')),
    weight: asString(child(raw, 'weight')),
  }
}

function parseRouteMapRule(number: string, raw: unknown): RouteMapRule {
  const onMatchRoot = child(raw, 'on-match')
  return {
    number,
    action: asString(child(raw, 'action')) as 'permit' | 'deny' | undefined,
    description: asString(child(raw, 'description')),
    call: asString(child(raw, 'call')),
    onMatchGoto: asString(child(onMatchRoot, 'goto')),
    onMatchNext: isFlagPresent(onMatchRoot, 'next'),
    match: parseRouteMapMatch(child(raw, 'match')),
    set: parseRouteMapSet(child(raw, 'set')),
  }
}

function parseRouteMaps(root: unknown): RouteMap[] {
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([name, raw]) => {
      const ruleRoot = child(raw, 'rule')
      const rules = isRecord(ruleRoot)
        ? Object.entries(ruleRoot)
            .map(([number, r]) => parseRouteMapRule(number, r))
            .sort((a, b) => Number(a.number) - Number(b.number))
        : []
      return { name, description: asString(child(raw, 'description')), rules }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- local route -----------------------------------------------------

function parseLocalRouteRule(family: LocalRouteFamily, number: string, raw: unknown): LocalRouteRule {
  const setRoot = child(raw, 'set')
  const sourceRoot = child(raw, 'source')
  const destinationRoot = child(raw, 'destination')
  return {
    family,
    number,
    protocol: asString(child(raw, 'protocol')),
    fwmark: asString(child(raw, 'fwmark')),
    sourceAddresses: asStringArray(child(sourceRoot, 'address')),
    sourcePort: asString(child(sourceRoot, 'port')),
    destinationAddresses: asStringArray(child(destinationRoot, 'address')),
    destinationPort: asString(child(destinationRoot, 'port')),
    inboundInterface: asString(child(raw, 'inbound-interface')),
    table: asString(child(setRoot, 'table')),
    vrf: asString(child(setRoot, 'vrf')),
  }
}

function parseLocalRoutes(family: LocalRouteFamily, root: unknown): LocalRouteRule[] {
  const ruleRoot = child(root, 'rule')
  if (!isRecord(ruleRoot)) return []
  return Object.entries(ruleRoot)
    .map(([number, raw]) => parseLocalRouteRule(family, number, raw))
    .sort((a, b) => Number(a.number) - Number(b.number))
}

// --- top level -------------------------------------------------------------

export function parsePolicyConfig(policy: unknown): PolicyConfig {
  return {
    prefixLists: [
      ...parsePrefixLists('ipv4', child(policy, 'prefix-list')),
      ...parsePrefixLists('ipv6', child(policy, 'prefix-list6')),
    ],
    asPathLists: parsePolicyLists('as-path', child(policy, 'as-path-list')),
    communityLists: parsePolicyLists('community', child(policy, 'community-list')),
    extcommunityLists: parsePolicyLists('extcommunity', child(policy, 'extcommunity-list')),
    largeCommunityLists: parsePolicyLists('large-community', child(policy, 'large-community-list')),
    routeMaps: parseRouteMaps(child(policy, 'route-map')),
    localRoutes: [
      ...parseLocalRoutes('ipv4', child(policy, 'local-route')),
      ...parseLocalRoutes('ipv6', child(policy, 'local-route6')),
    ],
  }
}

// --- path builders -----------------------------------------------------

function prefixListNode(family: PrefixListFamily): 'prefix-list' | 'prefix-list6' {
  return family === 'ipv6' ? 'prefix-list6' : 'prefix-list'
}

export function prefixListPath(family: PrefixListFamily, name: string, ...rest: string[]): string[] {
  return ['policy', prefixListNode(family), name, ...rest]
}

export function prefixListRulePath(
  family: PrefixListFamily,
  name: string,
  number: string,
  ...rest: string[]
): string[] {
  return prefixListPath(family, name, 'rule', number, ...rest)
}

function policyListNode(kind: PolicyListKind): string {
  return `${kind}-list`
}

export function policyListPath(kind: PolicyListKind, name: string, ...rest: string[]): string[] {
  return ['policy', policyListNode(kind), name, ...rest]
}

export function policyListRulePath(
  kind: PolicyListKind,
  name: string,
  number: string,
  ...rest: string[]
): string[] {
  return policyListPath(kind, name, 'rule', number, ...rest)
}

export function routeMapPath(name: string, ...rest: string[]): string[] {
  return ['policy', 'route-map', name, ...rest]
}

export function routeMapRulePath(name: string, number: string, ...rest: string[]): string[] {
  return routeMapPath(name, 'rule', number, ...rest)
}

function localRouteNode(family: LocalRouteFamily): 'local-route' | 'local-route6' {
  return family === 'ipv6' ? 'local-route6' : 'local-route'
}

export function localRoutePath(family: LocalRouteFamily, ...rest: string[]): string[] {
  return ['policy', localRouteNode(family), ...rest]
}

export function localRouteRulePath(
  family: LocalRouteFamily,
  number: string,
  ...rest: string[]
): string[] {
  return localRoutePath(family, 'rule', number, ...rest)
}
