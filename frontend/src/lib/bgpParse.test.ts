import { describe, expect, it } from 'vitest'
import { bgpAddressFamilyPath, bgpPeerPath, parseBGPConfig } from './bgpParse'

describe('parseBGPConfig', () => {
  it('parses system-as and router-id', () => {
    const bgp = { 'system-as': '64512', parameters: { 'router-id': '192.0.2.1' } }
    const config = parseBGPConfig(bgp)
    expect(config.systemAs).toBe('64512')
    expect(config.routerId).toBe('192.0.2.1')
  })

  it('returns undefined system-as/router-id and [] lists when protocols.bgp is absent', () => {
    const config = parseBGPConfig(undefined)
    expect(config.systemAs).toBeUndefined()
    expect(config.routerId).toBeUndefined()
    expect(config.neighbors).toEqual([])
    expect(config.peerGroups).toEqual([])
    expect(config.networks).toEqual([])
    expect(config.redistributions).toEqual([])
  })

  it('parses a neighbor with basic identity fields', () => {
    const bgp = {
      neighbor: {
        '192.0.2.2': {
          'remote-as': '64513',
          description: 'Upstream provider',
          shutdown: {},
          passive: {},
          'ebgp-multihop': '5',
          'update-source': '192.0.2.1',
        },
      },
    }
    const config = parseBGPConfig(bgp)
    expect(config.neighbors).toEqual([
      {
        identifier: '192.0.2.2',
        kind: 'neighbor',
        remoteAs: '64513',
        description: 'Upstream provider',
        hasPassword: false,
        shutdown: true,
        passive: true,
        ebgpMultihop: '5',
        updateSource: '192.0.2.1',
        peerGroup: undefined,
        ipv4Unicast: {
          nexthopSelf: false,
          removePrivateAs: false,
          softReconfigurationInbound: false,
          maximumPrefix: undefined,
        },
        ipv6Unicast: {
          nexthopSelf: false,
          removePrivateAs: false,
          softReconfigurationInbound: false,
          maximumPrefix: undefined,
        },
      },
    ])
  })

  it('reports hasPassword without ever exposing the (server-masked) value', () => {
    const bgp = { neighbor: { '192.0.2.2': { password: '••••••••' } } }
    const config = parseBGPConfig(bgp)
    expect(config.neighbors[0].hasPassword).toBe(true)
    // The type doesn't even have a field to hold the raw value - this
    // just confirms the parser never round-trips it as if it were
    // meaningful content.
    expect(config.neighbors[0]).not.toHaveProperty('password')
  })

  it('parses per-address-family settings for both ipv4-unicast and ipv6-unicast', () => {
    const bgp = {
      neighbor: {
        '192.0.2.2': {
          'address-family': {
            'ipv4-unicast': {
              'nexthop-self': {},
              'remove-private-as': {},
              'soft-reconfiguration': { inbound: {} },
              'maximum-prefix': '1000',
            },
            'ipv6-unicast': {
              'nexthop-self': {},
            },
          },
        },
      },
    }
    const config = parseBGPConfig(bgp)
    expect(config.neighbors[0].ipv4Unicast).toEqual({
      nexthopSelf: true,
      removePrivateAs: true,
      softReconfigurationInbound: true,
      maximumPrefix: '1000',
    })
    expect(config.neighbors[0].ipv6Unicast).toEqual({
      nexthopSelf: true,
      removePrivateAs: false,
      softReconfigurationInbound: false,
      maximumPrefix: undefined,
    })
  })

  it('parses a peer-group the same way as a neighbor, minus peer-group assignment', () => {
    const bgp = {
      'peer-group': {
        UPSTREAM: { 'remote-as': 'external', description: 'Transit peers' },
      },
    }
    const config = parseBGPConfig(bgp)
    expect(config.peerGroups).toEqual([
      expect.objectContaining({
        identifier: 'UPSTREAM',
        kind: 'peer-group',
        remoteAs: 'external',
        description: 'Transit peers',
      }),
    ])
  })

  it("parses a neighbor's peer-group assignment", () => {
    const bgp = { neighbor: { '192.0.2.2': { 'peer-group': 'UPSTREAM' } } }
    const config = parseBGPConfig(bgp)
    expect(config.neighbors[0].peerGroup).toBe('UPSTREAM')
  })

  it('sorts neighbors by identifier', () => {
    const bgp = { neighbor: { '192.0.2.2': {}, '10.0.0.1': {} } }
    const config = parseBGPConfig(bgp)
    expect(config.neighbors.map((n) => n.identifier)).toEqual(['10.0.0.1', '192.0.2.2'])
  })

  it('parses network advertisements for both families', () => {
    const bgp = {
      'address-family': {
        'ipv4-unicast': { network: { '198.51.100.0/24': {} } },
        'ipv6-unicast': { network: { '2001:db8::/32': {} } },
      },
    }
    const config = parseBGPConfig(bgp)
    expect(config.networks).toEqual([
      { family: 'ipv4', prefix: '198.51.100.0/24' },
      { family: 'ipv6', prefix: '2001:db8::/32' },
    ])
  })

  it('parses redistribution with an optional metric', () => {
    const bgp = {
      'address-family': {
        'ipv4-unicast': {
          redistribute: {
            static: { metric: '100' },
            connected: {},
          },
        },
      },
    }
    const config = parseBGPConfig(bgp)
    expect(config.redistributions).toEqual([
      { family: 'ipv4', source: 'connected', metric: undefined },
      { family: 'ipv4', source: 'static', metric: '100' },
    ])
  })
})

describe('bgpPeerPath / bgpAddressFamilyPath', () => {
  it('builds a neighbor path', () => {
    expect(bgpPeerPath('neighbor', '192.0.2.2', 'remote-as')).toEqual([
      'protocols',
      'bgp',
      'neighbor',
      '192.0.2.2',
      'remote-as',
    ])
  })

  it('builds a peer-group path', () => {
    expect(bgpPeerPath('peer-group', 'UPSTREAM', 'shutdown')).toEqual([
      'protocols',
      'bgp',
      'peer-group',
      'UPSTREAM',
      'shutdown',
    ])
  })

  it('builds an address-family path for each family', () => {
    expect(bgpAddressFamilyPath('ipv4', 'network', '198.51.100.0/24')).toEqual([
      'protocols',
      'bgp',
      'address-family',
      'ipv4-unicast',
      'network',
      '198.51.100.0/24',
    ])
    expect(bgpAddressFamilyPath('ipv6', 'network', '2001:db8::/32')).toEqual([
      'protocols',
      'bgp',
      'address-family',
      'ipv6-unicast',
      'network',
      '2001:db8::/32',
    ])
  })
})
