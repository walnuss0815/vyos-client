import { describe, expect, it } from 'vitest'
import { natRuleInterfacePath, natRulePath, natStaticRulePath, parseNATConfig } from './natParse'

describe('parseNATConfig - source rules', () => {
  it('returns empty lists when nat is absent', () => {
    const config = parseNATConfig(undefined)
    expect(config.sourceRules).toEqual([])
    expect(config.destinationRules).toEqual([])
    expect(config.staticRules).toEqual([])
  })

  it('parses a masquerade rule with outbound-interface and match fields', () => {
    const nat = {
      source: {
        rule: {
          '100': {
            description: 'LAN to WAN',
            'outbound-interface': { name: 'eth0' },
            source: { address: '192.168.0.0/24' },
            translation: { address: 'masquerade' },
          },
        },
      },
    }
    const config = parseNATConfig(nat)
    expect(config.sourceRules).toEqual([
      {
        kind: 'source',
        number: '100',
        description: 'LAN to WAN',
        interfaceName: 'eth0',
        protocol: undefined,
        source: { address: '192.168.0.0/24', port: undefined, addressGroup: undefined, networkGroup: undefined, portGroup: undefined },
        destination: { address: undefined, port: undefined, addressGroup: undefined, networkGroup: undefined, portGroup: undefined },
        translationAddress: 'masquerade',
        translationPort: undefined,
        redirectPort: undefined,
        disabled: false,
        exclude: false,
        log: false,
      },
    ])
  })

  it('parses source/destination group matching', () => {
    const nat = {
      source: {
        rule: {
          '100': {
            source: { group: { 'address-group': 'LAN_HOSTS' } },
            destination: { group: { 'network-group': 'REMOTE_NETS', 'port-group': 'WEB_PORTS' } },
          },
        },
      },
    }
    const config = parseNATConfig(nat)
    expect(config.sourceRules[0].source.addressGroup).toBe('LAN_HOSTS')
    expect(config.sourceRules[0].destination.networkGroup).toBe('REMOTE_NETS')
    expect(config.sourceRules[0].destination.portGroup).toBe('WEB_PORTS')
  })

  it('parses disable/exclude/log flags', () => {
    const nat = { source: { rule: { '100': { disable: {}, exclude: {}, log: {} } } } }
    const config = parseNATConfig(nat)
    expect(config.sourceRules[0]).toMatchObject({ disabled: true, exclude: true, log: true })
  })

  it('never sets redirectPort for source rules', () => {
    const nat = { source: { rule: { '100': { translation: { redirect: { port: '22' } } } } } }
    const config = parseNATConfig(nat)
    expect(config.sourceRules[0].redirectPort).toBeUndefined()
  })

  it('sorts rules numerically, not lexicographically', () => {
    const nat = { source: { rule: { '100': {}, '20': {}, '9': {} } } }
    const config = parseNATConfig(nat)
    expect(config.sourceRules.map((r) => r.number)).toEqual(['9', '20', '100'])
  })
})

describe('parseNATConfig - destination rules', () => {
  it('parses a port-forward rule with inbound-interface', () => {
    const nat = {
      destination: {
        rule: {
          '10': {
            description: 'Port Forward: HTTP',
            'inbound-interface': { name: 'eth0' },
            destination: { port: '80' },
            protocol: 'tcp',
            translation: { address: '192.168.0.100' },
          },
        },
      },
    }
    const config = parseNATConfig(nat)
    expect(config.destinationRules[0]).toMatchObject({
      kind: 'destination',
      number: '10',
      description: 'Port Forward: HTTP',
      interfaceName: 'eth0',
      protocol: 'tcp',
      translationAddress: '192.168.0.100',
    })
  })

  it('parses a redirect-to-localhost rule', () => {
    const nat = { destination: { rule: { '10': { translation: { redirect: { port: '22' } } } } } }
    const config = parseNATConfig(nat)
    expect(config.destinationRules[0].redirectPort).toBe('22')
  })
})

describe('parseNATConfig - static rules', () => {
  it('parses a 1-to-1 static NAT rule', () => {
    const nat = {
      static: {
        rule: {
          '2000': {
            description: '1-to-1 NAT example',
            destination: { address: '192.0.2.30' },
            'inbound-interface': 'eth1',
            translation: { address: '192.168.1.10' },
            log: {},
          },
        },
      },
    }
    const config = parseNATConfig(nat)
    expect(config.staticRules).toEqual([
      {
        number: '2000',
        description: '1-to-1 NAT example',
        destinationAddress: '192.0.2.30',
        interfaceName: 'eth1',
        translationAddress: '192.168.1.10',
        log: true,
      },
    ])
  })

  it('treats inbound-interface as a plain value, not a name sub-node', () => {
    const nat = { static: { rule: { '1': { 'inbound-interface': 'eth1' } } } }
    const config = parseNATConfig(nat)
    expect(config.staticRules[0].interfaceName).toBe('eth1')
  })

  it('sorts static rules numerically', () => {
    const nat = { static: { rule: { '2000': {}, '10': {} } } }
    const config = parseNATConfig(nat)
    expect(config.staticRules.map((r) => r.number)).toEqual(['10', '2000'])
  })
})

describe('path builders', () => {
  it('builds a source rule path', () => {
    expect(natRulePath('source', '100', 'description')).toEqual(['nat', 'source', 'rule', '100', 'description'])
  })

  it('builds a destination rule path', () => {
    expect(natRulePath('destination', '10', 'protocol')).toEqual(['nat', 'destination', 'rule', '10', 'protocol'])
  })

  it('builds the correct interface path per kind', () => {
    expect(natRuleInterfacePath('source', '100', 'name')).toEqual([
      'nat',
      'source',
      'rule',
      '100',
      'outbound-interface',
      'name',
    ])
    expect(natRuleInterfacePath('destination', '10', 'name')).toEqual([
      'nat',
      'destination',
      'rule',
      '10',
      'inbound-interface',
      'name',
    ])
  })

  it('builds a static rule path', () => {
    expect(natStaticRulePath('2000', 'translation', 'address')).toEqual([
      'nat',
      'static',
      'rule',
      '2000',
      'translation',
      'address',
    ])
  })
})
