import { describe, expect, it } from 'vitest'
import {
  blankSharedNetworkFormValues,
  blankStaticMappingFormValues,
  blankSubnetFormValues,
  sharedNetworkFormToOps,
  sharedNetworkToFormValues,
  staticMappingFormToOps,
  staticMappingToFormValues,
  subnetFormToOps,
  subnetToFormValues,
} from './dhcpConfigForm'
import type { DHCPSharedNetwork, DHCPStaticMapping, DHCPSubnet } from './dhcpConfigTypes'

function network(overrides: Partial<DHCPSharedNetwork> = {}): DHCPSharedNetwork {
  return {
    name: 'LAN',
    authoritative: false,
    options: { nameServers: [], ntpServers: [], domainSearch: [] },
    subnets: [],
    ...overrides,
  }
}

function subnet(overrides: Partial<DHCPSubnet> = {}): DHCPSubnet {
  return {
    cidr: '192.168.1.0/24',
    options: { nameServers: [], ntpServers: [], domainSearch: [] },
    ranges: [],
    excludes: [],
    staticMappings: [],
    ...overrides,
  }
}

function mapping(overrides: Partial<DHCPStaticMapping> = {}): DHCPStaticMapping {
  return { name: 'client1', ...overrides }
}

describe('sharedNetworkFormToOps', () => {
  it('queues only the fields filled in when creating (before = undefined)', () => {
    const values = blankSharedNetworkFormValues()
    values.authoritative = true
    values.defaultRouter = '192.168.1.1'

    const ops = sharedNetworkFormToOps('LAN', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'authoritative'] },
        {
          op: 'set',
          path: ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'option', 'default-router'],
          value: '192.168.1.1',
        },
      ]),
    )
    expect(ops).toHaveLength(2)
  })

  it('queues nothing when unchanged', () => {
    const n = network({ authoritative: true, options: { defaultRouter: '192.168.1.1', nameServers: [], ntpServers: [], domainSearch: [] } })
    expect(sharedNetworkFormToOps('LAN', n, sharedNetworkToFormValues(n))).toEqual([])
  })

  it('queues a delete when authoritative is turned off', () => {
    const n = network({ authoritative: true })
    const values = sharedNetworkToFormValues(n)
    values.authoritative = false
    expect(sharedNetworkFormToOps('LAN', n, values)).toEqual([
      { op: 'delete', path: ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'authoritative'] },
    ])
  })
})

describe('subnetFormToOps', () => {
  it('queues subnet-id, lease, and option fields', () => {
    const values = blankSubnetFormValues()
    values.subnetId = '1'
    values.lease = '3600'
    values.domainName = 'example.com'

    const ops = subnetFormToOps('LAN', '192.168.1.0/24', undefined, values)
    const base = ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'subnet', '192.168.1.0/24']

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: [...base, 'subnet-id'], value: '1' },
        { op: 'set', path: [...base, 'lease'], value: '3600' },
        { op: 'set', path: [...base, 'option', 'domain-name'], value: 'example.com' },
      ]),
    )
  })

  it('queues nothing when editing an unchanged subnet', () => {
    const s = subnet({ subnetId: '1', lease: 3600 })
    expect(subnetFormToOps('LAN', s.cidr, s, subnetToFormValues(s))).toEqual([])
  })

  it('queues only the changed field', () => {
    const s = subnet({ subnetId: '1', lease: 3600 })
    const values = subnetToFormValues(s)
    values.lease = '7200'
    expect(subnetFormToOps('LAN', s.cidr, s, values)).toEqual([
      {
        op: 'set',
        path: ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'subnet', '192.168.1.0/24', 'lease'],
        value: '7200',
      },
    ])
  })
})

describe('staticMappingFormToOps', () => {
  it('queues mac/duid/ip-address when creating', () => {
    const values = blankStaticMappingFormValues()
    values.mac = 'aa:bb:cc:dd:ee:ff'
    values.ipAddress = '192.168.1.100'

    const ops = staticMappingFormToOps('LAN', '192.168.1.0/24', 'client1', undefined, values)
    const base = [
      'service',
      'dhcp-server',
      'shared-network-name',
      'LAN',
      'subnet',
      '192.168.1.0/24',
      'static-mapping',
      'client1',
    ]

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: [...base, 'mac'], value: 'aa:bb:cc:dd:ee:ff' },
        { op: 'set', path: [...base, 'ip-address'], value: '192.168.1.100' },
      ]),
    )
    expect(ops).toHaveLength(2)
  })

  it('queues a delete when a previously-set field is cleared', () => {
    const m = mapping({ ipAddress: '192.168.1.100' })
    const values = staticMappingToFormValues(m)
    values.ipAddress = ''
    expect(staticMappingFormToOps('LAN', '192.168.1.0/24', 'client1', m, values)).toEqual([
      {
        op: 'delete',
        path: [
          'service',
          'dhcp-server',
          'shared-network-name',
          'LAN',
          'subnet',
          '192.168.1.0/24',
          'static-mapping',
          'client1',
          'ip-address',
        ],
      },
    ])
  })

  it('queues nothing when unchanged', () => {
    const m = mapping({ mac: 'aa:bb:cc:dd:ee:ff', ipAddress: '192.168.1.100' })
    expect(staticMappingFormToOps('LAN', '192.168.1.0/24', 'client1', m, staticMappingToFormValues(m))).toEqual([])
  })
})
