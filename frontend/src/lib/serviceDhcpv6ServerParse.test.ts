import { describe, expect, it } from 'vitest'
import {
  dhcpv6GlobalParametersPath,
  dhcpv6OptionPath,
  dhcpv6PrefixDelegationPath,
  dhcpv6RangePath,
  dhcpv6ServerPath,
  dhcpv6SharedNetworkPath,
  dhcpv6StaticMappingPath,
  dhcpv6SubnetPath,
  parseDHCPv6ServerConfig,
} from './serviceDhcpv6ServerParse'

describe('parseDHCPv6ServerConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseDHCPv6ServerConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseDHCPv6ServerConfig({}).enabled).toBe(true)
  })

  it('parses global settings', () => {
    const server = {
      disable: {},
      'listen-interface': ['eth0'],
      'disable-route-autoinstall': {},
      preference: '10',
      'log-level': 'debug',
      'global-parameters': { 'name-server': ['2001:db8::1'] },
    }
    const config = parseDHCPv6ServerConfig(server)
    expect(config.disabled).toBe(true)
    expect(config.listenInterfaces).toEqual(['eth0'])
    expect(config.disableRouteAutoinstall).toBe(true)
    expect(config.preference).toBe('10')
    expect(config.logLevel).toBe('debug')
    expect(config.globalNameServers).toEqual(['2001:db8::1'])
  })

  it('parses a shared network with a subnet, range, static-mapping, and prefix-delegation', () => {
    const server = {
      'shared-network-name': {
        LAN: {
          disable: {},
          description: 'Main LAN',
          interface: 'eth0',
          option: { 'name-server': ['2001:db8::1'], 'domain-search': ['example.com'], 'sntp-server': ['2001:db8::2'] },
          subnet: {
            '2001:db8::/64': {
              interface: 'eth0',
              'subnet-id': '1',
              'lease-time': { default: '3600', maximum: '7200', minimum: '600' },
              range: { r0: { prefix: '2001:db8::/72', start: '2001:db8::1', stop: '2001:db8::ff' } },
              'static-mapping': {
                'client1.example.com': {
                  mac: 'aa:bb:cc:dd:ee:ff',
                  duid: '00:01:00:01',
                  'ipv6-address': ['2001:db8::100'],
                  'ipv6-prefix': ['2001:db8:1::/64'],
                },
              },
              'prefix-delegation': {
                prefix: {
                  '2001:db8:1::': {
                    'prefix-length': '48',
                    'delegated-length': '64',
                    'excluded-prefix': '2001:db8:1:ff::',
                    'excluded-prefix-length': '64',
                  },
                },
              },
            },
          },
        },
      },
    }
    const config = parseDHCPv6ServerConfig(server)
    expect(config.sharedNetworks).toHaveLength(1)
    const network = config.sharedNetworks[0]
    expect(network).toMatchObject({ name: 'LAN', disabled: true, description: 'Main LAN', interface: 'eth0' })
    expect(network.option).toEqual({
      nameServers: ['2001:db8::1'],
      domainSearch: ['example.com'],
      sntpServers: ['2001:db8::2'],
    })

    const subnet = network.subnets[0]
    expect(subnet).toMatchObject({
      cidr: '2001:db8::/64',
      interface: 'eth0',
      subnetId: '1',
      leaseDefault: '3600',
      leaseMaximum: '7200',
      leaseMinimum: '600',
    })
    expect(subnet.ranges).toEqual([{ id: 'r0', prefix: '2001:db8::/72', start: '2001:db8::1', stop: '2001:db8::ff' }])
    expect(subnet.staticMappings).toEqual([
      {
        hostname: 'client1.example.com',
        disabled: false,
        mac: 'aa:bb:cc:dd:ee:ff',
        duid: '00:01:00:01',
        ipv6Addresses: ['2001:db8::100'],
        ipv6Prefixes: ['2001:db8:1::/64'],
      },
    ])
    expect(subnet.prefixDelegations).toEqual([
      {
        prefix: '2001:db8:1::',
        prefixLength: '48',
        delegatedLength: '64',
        excludedPrefix: '2001:db8:1:ff::',
        excludedPrefixLength: '64',
      },
    ])
  })

  it('sorts shared networks and subnets', () => {
    const server = {
      'shared-network-name': {
        zeta: { subnet: { '2001:db8:2::/64': {}, '2001:db8:1::/64': {} } },
        alpha: {},
      },
    }
    const config = parseDHCPv6ServerConfig(server)
    expect(config.sharedNetworks.map((n) => n.name)).toEqual(['alpha', 'zeta'])
    expect(config.sharedNetworks[1].subnets.map((s) => s.cidr)).toEqual(['2001:db8:1::/64', '2001:db8:2::/64'])
  })
})

describe('path builders', () => {
  it('builds base, global-parameters, and shared-network paths', () => {
    expect(dhcpv6ServerPath('preference')).toEqual(['service', 'dhcpv6-server', 'preference'])
    expect(dhcpv6GlobalParametersPath('name-server')).toEqual([
      'service',
      'dhcpv6-server',
      'global-parameters',
      'name-server',
    ])
    expect(dhcpv6SharedNetworkPath('LAN', 'description')).toEqual([
      'service',
      'dhcpv6-server',
      'shared-network-name',
      'LAN',
      'description',
    ])
  })

  it('builds subnet, range, static-mapping, prefix-delegation, and option paths', () => {
    const cidr = '2001:db8::/64'
    expect(dhcpv6SubnetPath('LAN', cidr, 'interface')).toEqual([
      'service',
      'dhcpv6-server',
      'shared-network-name',
      'LAN',
      'subnet',
      cidr,
      'interface',
    ])
    expect(dhcpv6RangePath('LAN', cidr, 'r0', 'start')).toEqual([
      'service',
      'dhcpv6-server',
      'shared-network-name',
      'LAN',
      'subnet',
      cidr,
      'range',
      'r0',
      'start',
    ])
    expect(dhcpv6StaticMappingPath('LAN', cidr, 'client1', 'mac')).toEqual([
      'service',
      'dhcpv6-server',
      'shared-network-name',
      'LAN',
      'subnet',
      cidr,
      'static-mapping',
      'client1',
      'mac',
    ])
    expect(dhcpv6PrefixDelegationPath('LAN', cidr, '2001:db8:1::', 'prefix-length')).toEqual([
      'service',
      'dhcpv6-server',
      'shared-network-name',
      'LAN',
      'subnet',
      cidr,
      'prefix-delegation',
      'prefix',
      '2001:db8:1::',
      'prefix-length',
    ])
    expect(dhcpv6OptionPath(['a', 'b'], 'name-server')).toEqual(['a', 'b', 'option', 'name-server'])
  })
})
