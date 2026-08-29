import { describe, expect, it } from 'vitest'
import {
  globalOptionsPath,
  groupPath,
  parseGlobalOptions,
  parseGroups,
  parseRulesets,
  parseZones,
  rulePath,
  rulesetPath,
  zonePath,
} from './firewallParse'

describe('parseZones', () => {
  it('parses a zone with multiple interfaces, a from-ruleset, and flags', () => {
    const firewall = {
      zone: {
        LAN: {
          description: 'Main LAN',
          interface: ['eth1', 'eth2'],
          'default-action': 'drop',
          'default-log': {},
          from: {
            WAN: { firewall: { name: 'WAN-LAN-v4' } },
          },
        },
      },
    }

    const zones = parseZones(firewall)
    expect(zones).toHaveLength(1)
    expect(zones[0]).toEqual({
      name: 'LAN',
      description: 'Main LAN',
      localZone: false,
      interfaces: ['eth1', 'eth2'],
      defaultAction: 'drop',
      defaultLog: true,
      from: { WAN: 'WAN-LAN-v4' },
    })
  })

  it('normalizes a single interface (bare string, not array) into an array', () => {
    const firewall = { zone: { WAN: { interface: 'eth0' } } }
    expect(parseZones(firewall)[0].interfaces).toEqual(['eth0'])
  })

  it('detects a local zone (no member interfaces)', () => {
    const firewall = { zone: { LOCAL: { 'local-zone': {} } } }
    const zone = parseZones(firewall)[0]
    expect(zone.localZone).toBe(true)
    expect(zone.interfaces).toEqual([])
  })

  it('sorts zones by name and returns [] when no zones are configured', () => {
    const firewall = { zone: { WAN: {}, LAN: {} } }
    expect(parseZones(firewall).map((z) => z.name)).toEqual(['LAN', 'WAN'])
    expect(parseZones({})).toEqual([])
    expect(parseZones(undefined)).toEqual([])
  })
})

describe('zonePath', () => {
  it('builds the firewall zone path', () => {
    expect(zonePath('LAN', 'default-action')).toEqual(['firewall', 'zone', 'LAN', 'default-action'])
  })
})

describe('parseGroups', () => {
  it('parses every group type with its correct member leaf name', () => {
    const firewall = {
      group: {
        'address-group': { SERVERS: { address: ['10.0.0.1', '10.0.0.2'], description: 'srv' } },
        'network-group': { TRUSTED: { network: '192.168.1.0/24' } },
        'port-group': { WEB: { port: ['80', '443'] } },
        'interface-group': { LAN: { interface: 'eth1' } },
        'mac-group': { KNOWN: { 'mac-address': '00:11:22:33:44:55' } },
        'domain-group': { ADS: { address: 'ads.example.com' } },
      },
    }

    const groups = parseGroups(firewall)
    expect(groups).toHaveLength(6)

    const byName = Object.fromEntries(groups.map((g) => [g.name, g]))
    expect(byName.SERVERS).toEqual({
      type: 'address-group',
      name: 'SERVERS',
      description: 'srv',
      members: ['10.0.0.1', '10.0.0.2'],
    })
    expect(byName.TRUSTED.members).toEqual(['192.168.1.0/24'])
    expect(byName.WEB.members).toEqual(['80', '443'])
    expect(byName.LAN.type).toBe('interface-group')
    expect(byName.KNOWN.members).toEqual(['00:11:22:33:44:55'])
    expect(byName.ADS.type).toBe('domain-group')
  })

  it('returns [] when no groups are configured', () => {
    expect(parseGroups({})).toEqual([])
  })
})

describe('parseRulesets', () => {
  it('parses base chains (forward/input/output) with rules sorted numerically', () => {
    const firewall = {
      ipv4: {
        forward: {
          filter: {
            'default-action': 'drop',
            rule: {
              '20': { action: 'accept', protocol: 'tcp' },
              '10': { action: 'drop', description: 'block early' },
            },
          },
        },
      },
    }

    const rulesets = parseRulesets(firewall)
    expect(rulesets).toHaveLength(1)
    expect(rulesets[0].id).toBe('forward')
    expect(rulesets[0].kind).toBe('base')
    expect(rulesets[0].defaultAction).toBe('drop')
    // Numeric sort, not lexical (would otherwise put "10" after "20").
    expect(rulesets[0].rules.map((r) => r.number)).toEqual(['10', '20'])
  })

  it('parses a custom chain (firewall ipv4 name) with description and default-action', () => {
    const firewall = {
      ipv4: {
        name: {
          'WAN-LAN-v4': {
            description: 'WAN to LAN',
            'default-action': 'drop',
            rule: { '10': { action: 'accept' } },
          },
        },
      },
    }

    const rulesets = parseRulesets(firewall)
    expect(rulesets).toEqual([
      {
        id: 'WAN-LAN-v4',
        kind: 'custom',
        family: 'ipv4',
        description: 'WAN to LAN',
        defaultAction: 'drop',
        rules: [
          expect.objectContaining({ number: '10', action: 'accept' }),
        ],
      },
    ])
  })

  it('parses full match criteria for a rule (source/destination address, port, groups)', () => {
    const firewall = {
      ipv4: {
        name: {
          TEST: {
            rule: {
              '10': {
                action: 'accept',
                protocol: 'tcp',
                log: {},
                disable: {},
                description: 'allow web',
                source: {
                  address: '10.0.0.0/24',
                  group: { 'address-group': 'SERVERS' },
                },
                destination: {
                  port: '443',
                  group: { 'port-group': 'WEB' },
                },
                'inbound-interface': { name: 'eth1' },
                'outbound-interface': { name: 'eth0' },
                icmp: { 'type-name': 'echo-request' },
              },
            },
          },
        },
      },
    }

    const rule = parseRulesets(firewall)[0].rules[0]
    expect(rule.action).toBe('accept')
    expect(rule.protocol).toBe('tcp')
    expect(rule.log).toBe(true)
    expect(rule.disabled).toBe(true)
    expect(rule.description).toBe('allow web')
    expect(rule.source).toEqual({
      address: '10.0.0.0/24',
      port: undefined,
      macAddress: undefined,
      addressGroup: 'SERVERS',
      networkGroup: undefined,
      portGroup: undefined,
      macGroup: undefined,
      domainGroup: undefined,
    })
    expect(rule.destination.port).toBe('443')
    expect(rule.destination.portGroup).toBe('WEB')
    expect(rule.inboundInterface).toBe('eth1')
    expect(rule.outboundInterface).toBe('eth0')
    expect(rule.icmpTypeName).toBe('echo-request')
  })

  it('ignores an unrecognized action value rather than throwing', () => {
    const firewall = {
      ipv4: { name: { X: { rule: { '10': { action: 'not-a-real-action' } } } } },
    }
    expect(parseRulesets(firewall)[0].rules[0].action).toBeUndefined()
  })

  it('returns [] when firewall.ipv4 and firewall.ipv6 are both absent', () => {
    expect(parseRulesets({})).toEqual([])
  })

  // IPv6 rulesets: genuinely separate rulesets under firewall.ipv6,
  // parsed the same way as ipv4 - see firewallTypes.ts's
  // FirewallFamily doc comment for how this was confirmed against
  // VyOS's own docs.
  it('parses ipv4 and ipv6 base chains as separate rulesets, even when both use the same chain name', () => {
    const firewall = {
      ipv4: { forward: { filter: { 'default-action': 'drop' } } },
      ipv6: { forward: { filter: { 'default-action': 'accept' } } },
    }

    const rulesets = parseRulesets(firewall)
    expect(rulesets).toHaveLength(2)
    const ipv4Forward = rulesets.find((rs) => rs.family === 'ipv4')
    const ipv6Forward = rulesets.find((rs) => rs.family === 'ipv6')
    expect(ipv4Forward).toMatchObject({ id: 'forward', kind: 'base', defaultAction: 'drop' })
    expect(ipv6Forward).toMatchObject({ id: 'forward', kind: 'base', defaultAction: 'accept' })
  })

  it('parses an ipv6 custom chain (firewall ipv6 name)', () => {
    const firewall = {
      ipv6: {
        name: {
          'WAN-LAN-v6': {
            description: 'WAN to LAN (v6)',
            'default-action': 'drop',
            rule: { '10': { action: 'accept' } },
          },
        },
      },
    }

    const rulesets = parseRulesets(firewall)
    expect(rulesets).toEqual([
      {
        id: 'WAN-LAN-v6',
        kind: 'custom',
        family: 'ipv6',
        description: 'WAN to LAN (v6)',
        defaultAction: 'drop',
        rules: [expect.objectContaining({ number: '10', action: 'accept' })],
      },
    ])
  })

  // The one structural difference between families at the rule-match
  // level: ICMP matching is under an `icmpv6` node for ipv6 rules, not
  // `icmp`.
  it("reads an ipv6 rule's ICMP type name from the icmpv6 node, not icmp", () => {
    const firewall = {
      ipv6: {
        name: {
          TEST: {
            rule: {
              '10': { action: 'accept', icmpv6: { 'type-name': 'echo-request' } },
            },
          },
        },
      },
    }

    const rule = parseRulesets(firewall)[0].rules[0]
    expect(rule.icmpTypeName).toBe('echo-request')
  })

  it("does not read an ipv6 rule's ICMP type name from an icmp (v4) node", () => {
    const firewall = {
      ipv6: {
        name: {
          TEST: {
            rule: {
              '10': { action: 'accept', icmp: { 'type-name': 'echo-request' } },
            },
          },
        },
      },
    }

    const rule = parseRulesets(firewall)[0].rules[0]
    expect(rule.icmpTypeName).toBeUndefined()
  })
})

describe('rulesetPath / rulePath', () => {
  it('builds a base-chain path via ipv4/<chain>/filter', () => {
    expect(rulesetPath({ id: 'forward', kind: 'base', family: 'ipv4' }, 'default-action')).toEqual([
      'firewall',
      'ipv4',
      'forward',
      'filter',
      'default-action',
    ])
  })

  it('builds a custom-chain path via ipv4/name/<id>', () => {
    expect(rulesetPath({ id: 'WAN-LAN-v4', kind: 'custom', family: 'ipv4' }, 'description')).toEqual([
      'firewall',
      'ipv4',
      'name',
      'WAN-LAN-v4',
      'description',
    ])
  })

  it('builds a rule path nested under the ruleset', () => {
    expect(rulePath({ id: 'input', kind: 'base', family: 'ipv4' }, '10', 'action')).toEqual([
      'firewall',
      'ipv4',
      'input',
      'filter',
      'rule',
      '10',
      'action',
    ])
  })

  it('uses the ipv6 family segment for an ipv6 ruleset', () => {
    expect(rulesetPath({ id: 'forward', kind: 'base', family: 'ipv6' }, 'default-action')).toEqual([
      'firewall',
      'ipv6',
      'forward',
      'filter',
      'default-action',
    ])
    expect(rulesetPath({ id: 'WAN-LAN-v6', kind: 'custom', family: 'ipv6' }, 'description')).toEqual([
      'firewall',
      'ipv6',
      'name',
      'WAN-LAN-v6',
      'description',
    ])
  })
})

describe('groupPath', () => {
  it('builds a firewall group path', () => {
    expect(groupPath('address-group', 'SERVERS', 'address')).toEqual([
      'firewall',
      'group',
      'address-group',
      'SERVERS',
      'address',
    ])
  })
})

describe('parseGlobalOptions', () => {
  it('parses enable/disable toggles and state-policy actions', () => {
    const firewall = {
      'global-options': {
        'all-ping': 'enable',
        'syn-cookies': 'disable',
        'state-policy': {
          established: { action: 'accept' },
          invalid: { action: 'drop' },
          related: { action: 'accept' },
        },
      },
    }

    expect(parseGlobalOptions(firewall)).toEqual({
      allPing: 'enable',
      broadcastPing: undefined,
      synCookies: 'disable',
      logMartians: undefined,
      ipSrcRoute: undefined,
      stateInvalidAction: 'drop',
      stateEstablishedAction: 'accept',
      stateRelatedAction: 'accept',
    })
  })

  it('returns all-undefined for an empty tree', () => {
    const opts = parseGlobalOptions({})
    expect(opts.allPing).toBeUndefined()
    expect(opts.stateInvalidAction).toBeUndefined()
  })
})

describe('globalOptionsPath', () => {
  it('builds the firewall global-options path', () => {
    expect(globalOptionsPath('all-ping')).toEqual(['firewall', 'global-options', 'all-ping'])
  })
})
