import { describe, expect, it } from 'vitest'
import {
  parseSharedNetworks,
  rangePath,
  sharedNetworkPath,
  staticMappingPath,
  subnetPath,
} from './dhcpConfigParse'

describe('parseSharedNetworks', () => {
  it('parses authoritative, options, and nested subnets', () => {
    const dhcpServer = {
      'shared-network-name': {
        NET1: {
          authoritative: null,
          option: {
            'default-router': '192.0.2.254',
            'name-server': ['192.0.2.1', '192.0.2.2'],
            'domain-name': 'example.com',
            'ntp-server': '192.0.2.5',
            'domain-search': ['example.com', 'corp.example.com'],
          },
          subnet: {
            '192.0.2.0/24': {
              'subnet-id': '1',
              lease: '3600',
              option: { 'default-router': '192.0.2.253' },
              range: { '0': { start: '192.0.2.10', stop: '192.0.2.250' } },
              exclude: '192.0.2.100',
              'static-mapping': {
                client1: { mac: 'aa:bb:11:22:33:00', 'ip-address': '192.0.2.100' },
              },
            },
          },
        },
      },
    }

    const [network] = parseSharedNetworks(dhcpServer)

    expect(network.name).toBe('NET1')
    expect(network.authoritative).toBe(true)
    expect(network.options).toEqual({
      defaultRouter: '192.0.2.254',
      nameServers: ['192.0.2.1', '192.0.2.2'],
      domainName: 'example.com',
      ntpServers: ['192.0.2.5'],
      domainSearch: ['example.com', 'corp.example.com'],
    })

    expect(network.subnets).toEqual([
      {
        cidr: '192.0.2.0/24',
        subnetId: '1',
        lease: 3600,
        options: {
          defaultRouter: '192.0.2.253',
          nameServers: [],
          domainName: undefined,
          ntpServers: [],
          domainSearch: [],
        },
        ranges: [{ id: '0', start: '192.0.2.10', stop: '192.0.2.250' }],
        excludes: ['192.0.2.100'],
        staticMappings: [{ name: 'client1', mac: 'aa:bb:11:22:33:00', duid: undefined, ipAddress: '192.0.2.100' }],
      },
    ])
  })

  it('defaults authoritative to false and options/ranges/excludes/mappings to empty when unset', () => {
    const dhcpServer = { 'shared-network-name': { NET1: {} } }
    const [network] = parseSharedNetworks(dhcpServer)
    expect(network.authoritative).toBe(false)
    expect(network.options).toEqual({
      defaultRouter: undefined,
      nameServers: [],
      domainName: undefined,
      ntpServers: [],
      domainSearch: [],
    })
    expect(network.subnets).toEqual([])
  })

  it('sorts networks by name and subnets by CIDR', () => {
    const dhcpServer = {
      'shared-network-name': {
        WIFI: { subnet: { '10.0.0.0/24': {} } },
        LAN: { subnet: { '192.168.1.0/24': {}, '10.0.0.0/24': {} } },
      },
    }
    const networks = parseSharedNetworks(dhcpServer)
    expect(networks.map((n) => n.name)).toEqual(['LAN', 'WIFI'])
    expect(networks[0].subnets.map((s) => s.cidr)).toEqual(['10.0.0.0/24', '192.168.1.0/24'])
  })

  it('sorts ranges numerically by ID, even when IDs are not zero-padded', () => {
    const dhcpServer = {
      'shared-network-name': {
        NET1: {
          subnet: {
            '192.0.2.0/24': {
              range: { '10': {}, '2': {}, '1': {} },
            },
          },
        },
      },
    }
    const [network] = parseSharedNetworks(dhcpServer)
    expect(network.subnets[0].ranges.map((r) => r.id)).toEqual(['1', '2', '10'])
  })

  it('handles a named (non-numeric) range ID without throwing', () => {
    const dhcpServer = {
      'shared-network-name': {
        NET1: {
          subnet: {
            '192.0.2.0/24': {
              range: { otherRange: { start: '192.0.2.5', stop: '192.0.2.100' } },
            },
          },
        },
      },
    }
    const [network] = parseSharedNetworks(dhcpServer)
    expect(network.subnets[0].ranges).toEqual([{ id: 'otherRange', start: '192.0.2.5', stop: '192.0.2.100' }])
  })

  it('returns an empty array when there is no dhcp-server config at all', () => {
    expect(parseSharedNetworks(undefined)).toEqual([])
    expect(parseSharedNetworks({})).toEqual([])
  })
})

describe('path builders', () => {
  it('sharedNetworkPath', () => {
    expect(sharedNetworkPath('NET1')).toEqual(['service', 'dhcp-server', 'shared-network-name', 'NET1'])
    expect(sharedNetworkPath('NET1', 'authoritative')).toEqual([
      'service',
      'dhcp-server',
      'shared-network-name',
      'NET1',
      'authoritative',
    ])
  })

  it('subnetPath', () => {
    expect(subnetPath('NET1', '192.0.2.0/24', 'lease')).toEqual([
      'service',
      'dhcp-server',
      'shared-network-name',
      'NET1',
      'subnet',
      '192.0.2.0/24',
      'lease',
    ])
  })

  it('rangePath', () => {
    expect(rangePath('NET1', '192.0.2.0/24', '0', 'start')).toEqual([
      'service',
      'dhcp-server',
      'shared-network-name',
      'NET1',
      'subnet',
      '192.0.2.0/24',
      'range',
      '0',
      'start',
    ])
  })

  it('staticMappingPath', () => {
    expect(staticMappingPath('NET1', '192.0.2.0/24', 'client1', 'mac')).toEqual([
      'service',
      'dhcp-server',
      'shared-network-name',
      'NET1',
      'subnet',
      '192.0.2.0/24',
      'static-mapping',
      'client1',
      'mac',
    ])
  })
})
