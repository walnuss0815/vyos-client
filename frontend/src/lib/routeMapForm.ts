import { routeMapPath, routeMapRulePath } from './policyParse'
import type { RouteMap, RouteMapMatch, RouteMapRule, RouteMapSet } from './policyTypes'
import type { ConfigOp } from './vyosApi'

// --- the route-map itself ------------------------------------------------

export interface RouteMapFormValues {
  description: string
}

export function blankRouteMapFormValues(): RouteMapFormValues {
  return { description: '' }
}

export function routeMapToFormValues(map: RouteMap): RouteMapFormValues {
  return { description: map.description ?? '' }
}

export function routeMapFormToOps(
  name: string,
  before: RouteMap | undefined,
  values: RouteMapFormValues,
): ConfigOp[] {
  const beforeValues = before ? routeMapToFormValues(before) : blankRouteMapFormValues()
  const ops: ConfigOp[] = []
  if (beforeValues.description !== values.description) {
    const path = routeMapPath(name, 'description')
    if (values.description.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.description.trim() })
  }
  return ops
}

export function deleteRouteMapOp(name: string): ConfigOp {
  return { op: 'delete', path: routeMapPath(name) }
}

// --- rules within a route-map --------------------------------------------

export interface RouteMapMatchFormValues {
  asPath: string
  communityList: string
  communityExactMatch: boolean
  ipPrefixList: string
  ipv6PrefixList: string
  protocol: string
  metric: string
  localPreference: string
  tag: string
}

function blankMatch(): RouteMapMatchFormValues {
  return {
    asPath: '',
    communityList: '',
    communityExactMatch: false,
    ipPrefixList: '',
    ipv6PrefixList: '',
    protocol: '',
    metric: '',
    localPreference: '',
    tag: '',
  }
}

function matchToFormValues(match: RouteMapMatch): RouteMapMatchFormValues {
  return {
    asPath: match.asPath ?? '',
    communityList: match.communityList ?? '',
    communityExactMatch: match.communityExactMatch,
    ipPrefixList: match.ipPrefixList ?? '',
    ipv6PrefixList: match.ipv6PrefixList ?? '',
    protocol: match.protocol ?? '',
    metric: match.metric ?? '',
    localPreference: match.localPreference ?? '',
    tag: match.tag ?? '',
  }
}

export interface RouteMapSetFormValues {
  metric: string
  localPreference: string
  asPathPrepend: string
  asPathExclude: string
  /** Single value for v1 - see policyTypes.ts's doc comment. */
  communityAdd: string
  communityReplace: string
  communityNone: boolean
  communityDelete: string
  origin: '' | 'igp' | 'egp' | 'incomplete'
  tag: string
  weight: string
}

function blankSet(): RouteMapSetFormValues {
  return {
    metric: '',
    localPreference: '',
    asPathPrepend: '',
    asPathExclude: '',
    communityAdd: '',
    communityReplace: '',
    communityNone: false,
    communityDelete: '',
    origin: '',
    tag: '',
    weight: '',
  }
}

function setToFormValues(set: RouteMapSet): RouteMapSetFormValues {
  return {
    metric: set.metric ?? '',
    localPreference: set.localPreference ?? '',
    asPathPrepend: set.asPathPrepend ?? '',
    asPathExclude: set.asPathExclude ?? '',
    communityAdd: set.communityAdd ?? '',
    communityReplace: set.communityReplace ?? '',
    communityNone: set.communityNone,
    communityDelete: set.communityDelete ?? '',
    origin: set.origin ?? '',
    tag: set.tag ?? '',
    weight: set.weight ?? '',
  }
}

export interface RouteMapRuleFormValues {
  action: '' | 'permit' | 'deny'
  description: string
  call: string
  onMatchGoto: string
  onMatchNext: boolean
  match: RouteMapMatchFormValues
  set: RouteMapSetFormValues
}

export function blankRouteMapRuleFormValues(): RouteMapRuleFormValues {
  return {
    action: '',
    description: '',
    call: '',
    onMatchGoto: '',
    onMatchNext: false,
    match: blankMatch(),
    set: blankSet(),
  }
}

export function routeMapRuleToFormValues(rule: RouteMapRule): RouteMapRuleFormValues {
  return {
    action: rule.action ?? '',
    description: rule.description ?? '',
    call: rule.call ?? '',
    onMatchGoto: rule.onMatchGoto ?? '',
    onMatchNext: rule.onMatchNext,
    match: matchToFormValues(rule.match),
    set: setToFormValues(rule.set),
  }
}

interface ScalarField {
  get: (v: RouteMapRuleFormValues) => string
  segments: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.action, segments: ['action'] },
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.call, segments: ['call'] },
  { get: (v) => v.onMatchGoto, segments: ['on-match', 'goto'] },
  { get: (v) => v.match.asPath, segments: ['match', 'as-path'] },
  { get: (v) => v.match.communityList, segments: ['match', 'community', 'community-list'] },
  { get: (v) => v.match.ipPrefixList, segments: ['match', 'ip', 'address', 'prefix-list'] },
  { get: (v) => v.match.ipv6PrefixList, segments: ['match', 'ipv6', 'address', 'prefix-list'] },
  { get: (v) => v.match.protocol, segments: ['match', 'protocol'] },
  { get: (v) => v.match.metric, segments: ['match', 'metric'] },
  { get: (v) => v.match.localPreference, segments: ['match', 'local-preference'] },
  { get: (v) => v.match.tag, segments: ['match', 'tag'] },
  { get: (v) => v.set.metric, segments: ['set', 'metric'] },
  { get: (v) => v.set.localPreference, segments: ['set', 'local-preference'] },
  { get: (v) => v.set.asPathPrepend, segments: ['set', 'as-path', 'prepend'] },
  { get: (v) => v.set.asPathExclude, segments: ['set', 'as-path', 'exclude'] },
  { get: (v) => v.set.communityAdd, segments: ['set', 'community', 'add'] },
  { get: (v) => v.set.communityReplace, segments: ['set', 'community', 'replace'] },
  { get: (v) => v.set.communityDelete, segments: ['set', 'community', 'delete'] },
  { get: (v) => v.set.origin, segments: ['set', 'origin'] },
  { get: (v) => v.set.tag, segments: ['set', 'tag'] },
  { get: (v) => v.set.weight, segments: ['set', 'weight'] },
]

interface FlagField {
  get: (v: RouteMapRuleFormValues) => boolean
  segments: string[]
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.onMatchNext, segments: ['on-match', 'next'] },
  { get: (v) => v.match.communityExactMatch, segments: ['match', 'community', 'exact-match'] },
  { get: (v) => v.set.communityNone, segments: ['set', 'community', 'none'] },
]

/**
 * Diffs `before` (the rule as last fetched, or undefined when
 * creating a new rule) against `values`, same set-or-delete-per-field
 * approach as every other diffed form in this codebase (see
 * bgpPeerForm.ts's peerFormToOps). A curated core of route-map's 60+
 * match/set commands - see policyTypes.ts's doc comment for the full
 * list of what's deliberately excluded.
 */
export function routeMapRuleFormToOps(
  mapName: string,
  ruleNumber: string,
  before: RouteMapRule | undefined,
  values: RouteMapRuleFormValues,
): ConfigOp[] {
  const beforeValues = before ? routeMapRuleToFormValues(before) : blankRouteMapRuleFormValues()
  const ops: ConfigOp[] = []

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = routeMapRulePath(mapName, ruleNumber, ...field.segments)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = routeMapRulePath(mapName, ruleNumber, ...field.segments)
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  return ops
}

export function deleteRouteMapRuleOp(mapName: string, ruleNumber: string): ConfigOp {
  return { op: 'delete', path: routeMapRulePath(mapName, ruleNumber) }
}
