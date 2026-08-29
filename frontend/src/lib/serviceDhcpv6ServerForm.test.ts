import { describe, expect, it } from 'vitest'
import {
  addDHCPv6PrefixDelegationOps,
  addDHCPv6RangeOps,
  addDHCPv6StaticMappingOps,
  blankDHCPv6GlobalFormValues,
  blankDHCPv6SharedNetworkFormValues,
  blankDHCPv6SubnetFormValues,
  deleteDHCPv6SharedNetworkOp,
  deleteDHCPv6SubnetOp,
  dhcpv6ConfigToGlobalFormValues,
  dhcpv6GlobalFormToOps,
  dhcpv6SharedNetworkFormToOps,
  dhcpv6SharedNetworkToFormValues,
  dhcpv6SubnetFormToOps,
  dhcpv6SubnetToFormValues,
  disableDHCPv6ServerOp,
  enableDHCPv6ServerOp,
  removeDHCPv6PrefixDelegationOp,
  removeDHCPv6RangeOp,
  removeDHCPv6StaticMappingOp,
} from './serviceDhcpv6ServerForm'
import {
  blankDHCPv6ServerConfig,
  blankDHCPv6SharedNetwork,
  blankDHCPv6Subnet,
  type DHCPv6SharedNetwork,
  type DHCPv6Subnet,
} from './serviceDhcpv6ServerTypes'

describe('dhcpv6GlobalFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(dhcpv6GlobalFormToOps(blankDHCPv6ServerConfig(), blankDHCPv6GlobalFormValues())).toEqual([])
  })

  it('queues flags and scalars', () => {
    const values = blankDHCPv6GlobalFormValues()
    values.disabled = true
    values.preference = '10'

    expect(dhcpv6GlobalFormToOps(blankDHCPv6ServerConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'dhcpv6-server', 'disable'] },
      { op: 'set', path: ['service', 'dhcpv6-server', 'preference'], value: '10' },
    ])
  })

  it('queues a delete when cleared', () => {
    const before = { ...blankDHCPv6ServerConfig(), preference: '10' }
    const values = dhcpv6ConfigToGlobalFormValues(before)
    values.preference = ''

    expect(dhcpv6GlobalFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'dhcpv6-server', 'preference'] },
    ])
  })
})

describe('enableDHCPv6ServerOp / disableDHCPv6ServerOp', () => {
  it('builds the expected ops', () => {
    expect(enableDHCPv6ServerOp()).toEqual({ op: 'set', path: ['service', 'dhcpv6-server'] })
    expect(disableDHCPv6ServerOp()).toEqual({ op: 'delete', path: ['service', 'dhcpv6-server'] })
  })
})

function emptyNetwork(overrides: Partial<DHCPv6SharedNetwork> = {}): DHCPv6SharedNetwork {
  return { name: 'LAN', ...blankDHCPv6SharedNetwork(), ...overrides }
}

describe('dhcpv6SharedNetworkFormToOps', () => {
  it('always sets the network tag for a brand-new network', () => {
    expect(dhcpv6SharedNetworkFormToOps('LAN', undefined, blankDHCPv6SharedNetworkFormValues())).toEqual([
      { op: 'set', path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN'] },
    ])
  })

  it('queues description and disable', () => {
    const values = blankDHCPv6SharedNetworkFormValues()
    values.description = 'Main LAN'
    values.disabled = true

    const ops = dhcpv6SharedNetworkFormToOps('LAN', undefined, values)
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'description'], value: 'Main LAN' },
        { op: 'set', path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'disable'] },
      ]),
    )
  })

  it('queues nothing extra when editing unchanged', () => {
    const network = emptyNetwork({ description: 'Main LAN' })
    expect(dhcpv6SharedNetworkFormToOps('LAN', network, dhcpv6SharedNetworkToFormValues(network))).toEqual([])
  })
})

describe('deleteDHCPv6SharedNetworkOp', () => {
  it('builds a delete op', () => {
    expect(deleteDHCPv6SharedNetworkOp('LAN')).toEqual({
      op: 'delete',
      path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN'],
    })
  })
})

function emptySubnet(overrides: Partial<DHCPv6Subnet> = {}): DHCPv6Subnet {
  return { cidr: '2001:db8::/64', ...blankDHCPv6Subnet(), ...overrides }
}

describe('dhcpv6SubnetFormToOps', () => {
  it('always sets the subnet tag for a brand-new subnet', () => {
    expect(dhcpv6SubnetFormToOps('LAN', '2001:db8::/64', undefined, blankDHCPv6SubnetFormValues())).toEqual([
      { op: 'set', path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64'] },
    ])
  })

  it('queues lease-time fields', () => {
    const values = blankDHCPv6SubnetFormValues()
    values.leaseDefault = '3600'

    const ops = dhcpv6SubnetFormToOps('LAN', '2001:db8::/64', undefined, values)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64', 'lease-time', 'default'],
      value: '3600',
    })
  })

  it('queues nothing extra when editing unchanged', () => {
    const subnet = emptySubnet({ subnetId: '1' })
    expect(dhcpv6SubnetFormToOps('LAN', '2001:db8::/64', subnet, dhcpv6SubnetToFormValues(subnet))).toEqual([])
  })
})

describe('deleteDHCPv6SubnetOp', () => {
  it('builds a delete op', () => {
    expect(deleteDHCPv6SubnetOp('LAN', '2001:db8::/64')).toEqual({
      op: 'delete',
      path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64'],
    })
  })
})

describe('range ops', () => {
  it('always sets the range tag, plus prefix/start/stop when given', () => {
    const ops = addDHCPv6RangeOps('LAN', '2001:db8::/64', 'r0', '2001:db8::/72', '2001:db8::1', '2001:db8::ff')
    expect(ops).toEqual([
      { op: 'set', path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64', 'range', 'r0'] },
      {
        op: 'set',
        path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64', 'range', 'r0', 'prefix'],
        value: '2001:db8::/72',
      },
      {
        op: 'set',
        path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64', 'range', 'r0', 'start'],
        value: '2001:db8::1',
      },
      {
        op: 'set',
        path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64', 'range', 'r0', 'stop'],
        value: '2001:db8::ff',
      },
    ])
  })

  it('builds a remove op', () => {
    expect(removeDHCPv6RangeOp('LAN', '2001:db8::/64', 'r0')).toEqual({
      op: 'delete',
      path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64', 'range', 'r0'],
    })
  })
})

describe('static mapping ops', () => {
  it('always sets the mapping tag, plus mac/duid/disable when given', () => {
    const ops = addDHCPv6StaticMappingOps('LAN', '2001:db8::/64', 'client1', {
      mac: 'aa:bb:cc:dd:ee:ff',
      duid: '',
      disabled: true,
    })
    expect(ops).toEqual([
      {
        op: 'set',
        path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64', 'static-mapping', 'client1'],
      },
      {
        op: 'set',
        path: [
          'service',
          'dhcpv6-server',
          'shared-network-name',
          'LAN',
          'subnet',
          '2001:db8::/64',
          'static-mapping',
          'client1',
          'mac',
        ],
        value: 'aa:bb:cc:dd:ee:ff',
      },
      {
        op: 'set',
        path: [
          'service',
          'dhcpv6-server',
          'shared-network-name',
          'LAN',
          'subnet',
          '2001:db8::/64',
          'static-mapping',
          'client1',
          'disable',
        ],
      },
    ])
  })

  it('builds a remove op', () => {
    expect(removeDHCPv6StaticMappingOp('LAN', '2001:db8::/64', 'client1')).toEqual({
      op: 'delete',
      path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64', 'static-mapping', 'client1'],
    })
  })
})

describe('prefix delegation ops', () => {
  it('always sets the prefix tag, plus any given options', () => {
    const ops = addDHCPv6PrefixDelegationOps('LAN', '2001:db8::/64', '2001:db8:1::', {
      prefixLength: '48',
      delegatedLength: '64',
      excludedPrefix: '',
      excludedPrefixLength: '',
    })
    expect(ops).toEqual([
      {
        op: 'set',
        path: [
          'service',
          'dhcpv6-server',
          'shared-network-name',
          'LAN',
          'subnet',
          '2001:db8::/64',
          'prefix-delegation',
          'prefix',
          '2001:db8:1::',
        ],
      },
      {
        op: 'set',
        path: [
          'service',
          'dhcpv6-server',
          'shared-network-name',
          'LAN',
          'subnet',
          '2001:db8::/64',
          'prefix-delegation',
          'prefix',
          '2001:db8:1::',
          'prefix-length',
        ],
        value: '48',
      },
      {
        op: 'set',
        path: [
          'service',
          'dhcpv6-server',
          'shared-network-name',
          'LAN',
          'subnet',
          '2001:db8::/64',
          'prefix-delegation',
          'prefix',
          '2001:db8:1::',
          'delegated-length',
        ],
        value: '64',
      },
    ])
  })

  it('builds a remove op', () => {
    expect(removeDHCPv6PrefixDelegationOp('LAN', '2001:db8::/64', '2001:db8:1::')).toEqual({
      op: 'delete',
      path: [
        'service',
        'dhcpv6-server',
        'shared-network-name',
        'LAN',
        'subnet',
        '2001:db8::/64',
        'prefix-delegation',
        'prefix',
        '2001:db8:1::',
      ],
    })
  })
})
