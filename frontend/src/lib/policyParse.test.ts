import { describe, expect, it } from 'vitest'
import {
  localRoutePath,
  localRouteRulePath,
  parsePolicyConfig,
  policyListPath,
  policyListRulePath,
  prefixListPath,
  prefixListRulePath,
  routeMapPath,
  routeMapRulePath,
} from './policyParse'

describe('parsePolicyConfig - empty', () => {
  it('returns empty lists when policy is absent', () => {
    const config = parsePolicyConfig(undefined)
    expect(config).toEqual({
      prefixLists: [],
      asPathLists: [],
      communityLists: [],
      extcommunityLists: [],
      largeCommunityLists: [],
      routeMaps: [],
      localRoutes: [],
    })
  })
})

describe('parsePolicyConfig - prefix lists', () => {
  it('parses ipv4 and ipv6 prefix lists with rules', () => {
    const policy = {
      'prefix-list': {
        'PL4-EXAMPLE': {
          description: 'v4 example',
          rule: { '10': { action: 'permit', prefix: '192.0.2.0/24', le: '32' } },
        },
      },
      'prefix-list6': {
        'PL6-EXAMPLE': {
          rule: { '10': { action: 'permit', prefix: '2001:db8::/32', ge: '64' } },
        },
      },
    }
    const config = parsePolicyConfig(policy)
    expect(config.prefixLists).toEqual([
      {
        family: 'ipv4',
        name: 'PL4-EXAMPLE',
        description: 'v4 example',
        rules: [
          { number: '10', action: 'permit', description: undefined, prefix: '192.0.2.0/24', ge: undefined, le: '32' },
        ],
      },
      {
        family: 'ipv6',
        name: 'PL6-EXAMPLE',
        description: undefined,
        rules: [
          { number: '10', action: 'permit', description: undefined, prefix: '2001:db8::/32', ge: '64', le: undefined },
        ],
      },
    ])
  })

  it('sorts rules numerically and lists alphabetically', () => {
    const policy = {
      'prefix-list': {
        ZETA: { rule: { '20': {}, '9': {} } },
        ALPHA: { rule: {} },
      },
    }
    const config = parsePolicyConfig(policy)
    expect(config.prefixLists.map((l) => l.name)).toEqual(['ALPHA', 'ZETA'])
    expect(config.prefixLists[1].rules.map((r) => r.number)).toEqual(['9', '20'])
  })
})

describe('parsePolicyConfig - as-path/community/extcommunity/large-community lists', () => {
  it('parses all four list kinds with rules', () => {
    const policy = {
      'as-path-list': { ASPL: { rule: { '10': { action: 'permit', regex: '^64512' } } } },
      'community-list': { CL: { rule: { '10': { action: 'deny', regex: 'no-export' } } } },
      'extcommunity-list': { ECL: { rule: { '10': { regex: 'rt 64512:100' } } } },
      'large-community-list': { LCL: { rule: { '10': { regex: '64512:1:1' } } } },
    }
    const config = parsePolicyConfig(policy)
    expect(config.asPathLists).toEqual([
      { kind: 'as-path', name: 'ASPL', description: undefined, rules: [{ number: '10', action: 'permit', description: undefined, regex: '^64512' }] },
    ])
    expect(config.communityLists[0].rules[0]).toEqual({ number: '10', action: 'deny', description: undefined, regex: 'no-export' })
    expect(config.extcommunityLists[0].kind).toBe('extcommunity')
    expect(config.largeCommunityLists[0].kind).toBe('large-community')
  })
})

describe('parsePolicyConfig - route maps', () => {
  it('parses basic rule fields', () => {
    const policy = {
      'route-map': {
        EXPORT: {
          description: 'export map',
          rule: {
            '10': {
              action: 'permit',
              description: 'allow connected',
              call: 'OTHER-MAP',
              'on-match': { goto: '20' },
            },
          },
        },
      },
    }
    const config = parsePolicyConfig(policy)
    expect(config.routeMaps[0]).toMatchObject({
      name: 'EXPORT',
      description: 'export map',
    })
    expect(config.routeMaps[0].rules[0]).toMatchObject({
      number: '10',
      action: 'permit',
      description: 'allow connected',
      call: 'OTHER-MAP',
      onMatchGoto: '20',
      onMatchNext: false,
    })
  })

  it('parses on-match next as a flag', () => {
    const policy = { 'route-map': { M: { rule: { '10': { 'on-match': { next: {} } } } } } }
    const config = parsePolicyConfig(policy)
    expect(config.routeMaps[0].rules[0].onMatchNext).toBe(true)
  })

  it('parses match fields, including nested community/ip/ipv6 prefix-list', () => {
    const policy = {
      'route-map': {
        M: {
          rule: {
            '10': {
              match: {
                'as-path': 'ASPL',
                community: { 'community-list': 'CL', 'exact-match': {} },
                ip: { address: { 'prefix-list': 'PL4' } },
                ipv6: { address: { 'prefix-list': 'PL6' } },
                protocol: 'bgp',
                metric: '100',
                'local-preference': '200',
                tag: '5',
              },
            },
          },
        },
      },
    }
    const config = parsePolicyConfig(policy)
    expect(config.routeMaps[0].rules[0].match).toEqual({
      asPath: 'ASPL',
      communityList: 'CL',
      communityExactMatch: true,
      ipPrefixList: 'PL4',
      ipv6PrefixList: 'PL6',
      protocol: 'bgp',
      metric: '100',
      localPreference: '200',
      tag: '5',
    })
  })

  it('parses set fields, including as-path/community sub-nodes', () => {
    const policy = {
      'route-map': {
        M: {
          rule: {
            '10': {
              set: {
                metric: '+10',
                'local-preference': '150',
                'as-path': { prepend: '64512 64512', exclude: 'all' },
                community: { add: ['no-export'], none: {}, delete: 'CL' },
                origin: 'igp',
                tag: '7',
                weight: '100',
              },
            },
          },
        },
      },
    }
    const config = parsePolicyConfig(policy)
    expect(config.routeMaps[0].rules[0].set).toEqual({
      metric: '+10',
      localPreference: '150',
      asPathPrepend: '64512 64512',
      asPathExclude: 'all',
      communityAdd: 'no-export',
      communityReplace: undefined,
      communityNone: true,
      communityDelete: 'CL',
      origin: 'igp',
      tag: '7',
      weight: '100',
    })
  })
})

describe('parsePolicyConfig - local route', () => {
  it('parses multi-valued source/destination addresses', () => {
    const policy = {
      'local-route': {
        rule: {
          '100': {
            protocol: 'tcp',
            fwmark: '1',
            source: { address: ['192.0.2.0/24', '198.51.100.0/24'], port: '80' },
            destination: { address: '203.0.113.5' },
            'inbound-interface': 'eth0',
            set: { table: '100', vrf: 'BLUE' },
          },
        },
      },
    }
    const config = parsePolicyConfig(policy)
    expect(config.localRoutes).toEqual([
      {
        family: 'ipv4',
        number: '100',
        protocol: 'tcp',
        fwmark: '1',
        sourceAddresses: ['192.0.2.0/24', '198.51.100.0/24'],
        sourcePort: '80',
        destinationAddresses: ['203.0.113.5'],
        destinationPort: undefined,
        inboundInterface: 'eth0',
        table: '100',
        vrf: 'BLUE',
      },
    ])
  })

  it('parses local-route6 into the ipv6 family', () => {
    const policy = { 'local-route6': { rule: { '100': {} } } }
    const config = parsePolicyConfig(policy)
    expect(config.localRoutes[0].family).toBe('ipv6')
  })
})

describe('path builders', () => {
  it('builds prefix-list paths per family', () => {
    expect(prefixListPath('ipv4', 'PL4')).toEqual(['policy', 'prefix-list', 'PL4'])
    expect(prefixListPath('ipv6', 'PL6')).toEqual(['policy', 'prefix-list6', 'PL6'])
    expect(prefixListRulePath('ipv4', 'PL4', '10', 'action')).toEqual([
      'policy',
      'prefix-list',
      'PL4',
      'rule',
      '10',
      'action',
    ])
  })

  it('builds policy-list paths per kind', () => {
    expect(policyListPath('as-path', 'ASPL')).toEqual(['policy', 'as-path-list', 'ASPL'])
    expect(policyListPath('large-community', 'LCL')).toEqual(['policy', 'large-community-list', 'LCL'])
    expect(policyListRulePath('community', 'CL', '10', 'regex')).toEqual([
      'policy',
      'community-list',
      'CL',
      'rule',
      '10',
      'regex',
    ])
  })

  it('builds route-map paths', () => {
    expect(routeMapPath('M')).toEqual(['policy', 'route-map', 'M'])
    expect(routeMapRulePath('M', '10', 'action')).toEqual(['policy', 'route-map', 'M', 'rule', '10', 'action'])
  })

  it('builds local-route paths per family', () => {
    expect(localRoutePath('ipv4')).toEqual(['policy', 'local-route'])
    expect(localRoutePath('ipv6')).toEqual(['policy', 'local-route6'])
    expect(localRouteRulePath('ipv4', '100', 'protocol')).toEqual([
      'policy',
      'local-route',
      'rule',
      '100',
      'protocol',
    ])
  })
})
