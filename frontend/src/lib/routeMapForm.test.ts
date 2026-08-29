import { describe, expect, it } from 'vitest'
import {
  blankRouteMapFormValues,
  blankRouteMapRuleFormValues,
  deleteRouteMapOp,
  deleteRouteMapRuleOp,
  routeMapFormToOps,
  routeMapRuleFormToOps,
  routeMapRuleToFormValues,
  routeMapToFormValues,
} from './routeMapForm'
import type { RouteMap, RouteMapRule } from './policyTypes'

function emptyMap(overrides: Partial<RouteMap> = {}): RouteMap {
  return { name: 'EXPORT', rules: [], ...overrides }
}

function emptyRule(overrides: Partial<RouteMapRule> = {}): RouteMapRule {
  return {
    number: '10',
    onMatchNext: false,
    match: { communityExactMatch: false },
    set: { communityNone: false },
    ...overrides,
  }
}

describe('routeMapFormToOps', () => {
  it('queues nothing for a blank form', () => {
    expect(routeMapFormToOps('EXPORT', undefined, blankRouteMapFormValues())).toEqual([])
  })

  it('queues a description set', () => {
    const values = blankRouteMapFormValues()
    values.description = 'export filter'
    expect(routeMapFormToOps('EXPORT', undefined, values)).toEqual([
      { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'description'], value: 'export filter' },
    ])
  })

  it('queues nothing when unchanged', () => {
    const map = emptyMap({ description: 'x' })
    expect(routeMapFormToOps('EXPORT', map, routeMapToFormValues(map))).toEqual([])
  })
})

describe('deleteRouteMapOp', () => {
  it('builds a delete op for the whole route-map', () => {
    expect(deleteRouteMapOp('EXPORT')).toEqual({ op: 'delete', path: ['policy', 'route-map', 'EXPORT'] })
  })
})

describe('routeMapRuleFormToOps - creating a new rule', () => {
  it('queues nothing for a blank form', () => {
    expect(routeMapRuleFormToOps('EXPORT', '10', undefined, blankRouteMapRuleFormValues())).toEqual([])
  })

  it('queues action/description/call', () => {
    const values = blankRouteMapRuleFormValues()
    values.action = 'permit'
    values.description = 'allow connected'
    values.call = 'OTHER-MAP'

    const ops = routeMapRuleFormToOps('EXPORT', '10', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'action'], value: 'permit' },
        {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'description'],
          value: 'allow connected',
        },
        { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'call'], value: 'OTHER-MAP' },
      ]),
    )
  })

  it('queues on-match goto and next', () => {
    const values = blankRouteMapRuleFormValues()
    values.onMatchGoto = '20'
    values.onMatchNext = true

    const ops = routeMapRuleFormToOps('EXPORT', '10', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'on-match', 'goto'], value: '20' },
        { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'on-match', 'next'] },
      ]),
    )
  })

  it('queues match fields with correct nesting for community/ip/ipv6', () => {
    const values = blankRouteMapRuleFormValues()
    values.match.asPath = 'ASPL'
    values.match.communityList = 'CL'
    values.match.communityExactMatch = true
    values.match.ipPrefixList = 'PL4'
    values.match.ipv6PrefixList = 'PL6'
    values.match.protocol = 'bgp'

    const ops = routeMapRuleFormToOps('EXPORT', '10', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'match', 'as-path'], value: 'ASPL' },
        {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'match', 'community', 'community-list'],
          value: 'CL',
        },
        {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'match', 'community', 'exact-match'],
        },
        {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'match', 'ip', 'address', 'prefix-list'],
          value: 'PL4',
        },
        {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'match', 'ipv6', 'address', 'prefix-list'],
          value: 'PL6',
        },
        { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'match', 'protocol'], value: 'bgp' },
      ]),
    )
  })

  it('queues set fields with correct nesting for as-path/community', () => {
    const values = blankRouteMapRuleFormValues()
    values.set.metric = '+10'
    values.set.asPathPrepend = '64512 64512'
    values.set.asPathExclude = 'all'
    values.set.communityAdd = 'no-export'
    values.set.communityNone = true

    const ops = routeMapRuleFormToOps('EXPORT', '10', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'set', 'metric'], value: '+10' },
        {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'set', 'as-path', 'prepend'],
          value: '64512 64512',
        },
        {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'set', 'as-path', 'exclude'],
          value: 'all',
        },
        {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'set', 'community', 'add'],
          value: 'no-export',
        },
        { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'set', 'community', 'none'] },
      ]),
    )
  })
})

describe('routeMapRuleFormToOps - editing an existing rule', () => {
  it('queues nothing when unchanged', () => {
    const rule = emptyRule({ action: 'permit', match: { asPath: 'ASPL', communityExactMatch: false } })
    expect(routeMapRuleFormToOps('EXPORT', '10', rule, routeMapRuleToFormValues(rule))).toEqual([])
  })

  it('diffs a single match field', () => {
    const rule = emptyRule({ match: { protocol: 'bgp', communityExactMatch: false } })
    const values = routeMapRuleToFormValues(rule)
    values.match.protocol = 'ospf'

    expect(routeMapRuleFormToOps('EXPORT', '10', rule, values)).toEqual([
      { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'match', 'protocol'], value: 'ospf' },
    ])
  })

  it('queues a flag delete when community exact-match is unchecked', () => {
    const rule = emptyRule({ match: { communityExactMatch: true } })
    const values = routeMapRuleToFormValues(rule)
    values.match.communityExactMatch = false

    expect(routeMapRuleFormToOps('EXPORT', '10', rule, values)).toEqual([
      { op: 'delete', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'match', 'community', 'exact-match'] },
    ])
  })

  it('queues a delete when a set field is cleared', () => {
    const rule = emptyRule({ set: { weight: '100', communityNone: false } })
    const values = routeMapRuleToFormValues(rule)
    values.set.weight = ''

    expect(routeMapRuleFormToOps('EXPORT', '10', rule, values)).toEqual([
      { op: 'delete', path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'set', 'weight'] },
    ])
  })
})

describe('deleteRouteMapRuleOp', () => {
  it('builds a delete op for a single rule', () => {
    expect(deleteRouteMapRuleOp('EXPORT', '10')).toEqual({
      op: 'delete',
      path: ['policy', 'route-map', 'EXPORT', 'rule', '10'],
    })
  })
})
