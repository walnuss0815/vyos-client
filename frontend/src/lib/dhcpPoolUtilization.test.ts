import { describe, expect, it } from 'vitest'
import { computePoolUtilization, isAddressInDynamicRange } from './dhcpPoolUtilization'
import type { DHCPSharedNetwork, DHCPSubnet } from './dhcpConfigTypes'
import type { DHCPLease } from './vyosApi'

function network(overrides: Partial<DHCPSharedNetwork> = {}): DHCPSharedNetwork {
  return {
    name: 'LAN',
    authoritative: false,
    options: { nameServers: [], ntpServers: [], domainSearch: [] },
    subnets: [],
    ...overrides,
  }
}

function lease(overrides: Partial<DHCPLease> = {}): DHCPLease {
  return {
    ipAddress: '192.168.1.50',
    macAddress: '00:11:22:33:44:55',
    state: 'active',
    leaseStart: '',
    leaseEnd: '',
    remaining: '',
    pool: 'LAN',
    hostname: '',
    origin: 'local',
    ...overrides,
  }
}

describe('computePoolUtilization', () => {
  it('sums range sizes across every subnet, and counts leases matching the pool name', () => {
    const n = network({
      subnets: [
        {
          cidr: '192.168.1.0/24',
          options: { nameServers: [], ntpServers: [], domainSearch: [] },
          ranges: [{ id: '0', start: '192.168.1.50', stop: '192.168.1.149' }], // 100 addresses
          excludes: [],
          staticMappings: [],
        },
        {
          cidr: '192.168.2.0/24',
          options: { nameServers: [], ntpServers: [], domainSearch: [] },
          ranges: [{ id: '0', start: '192.168.2.1', stop: '192.168.2.50' }], // 50 addresses
          excludes: [],
          staticMappings: [],
        },
      ],
    })
    const leases = [lease(), lease({ pool: 'WIFI' }), lease()]

    const result = computePoolUtilization(n, leases)

    expect(result.size).toBe(150)
    expect(result.leased).toBe(2) // only the two LAN leases, not the WIFI one
    expect(result.available).toBe(148)
    expect(result.usagePercent).toBe(1) // round(2/150*100) = 1
  })

  it('returns all zeros for a network with no ranges', () => {
    const n = network()
    expect(computePoolUtilization(n, [])).toEqual({ size: 0, leased: 0, available: 0, usagePercent: 0 })
  })

  it('ignores ranges missing a start or stop bound', () => {
    const n = network({
      subnets: [
        {
          cidr: '192.168.1.0/24',
          options: { nameServers: [], ntpServers: [], domainSearch: [] },
          ranges: [{ id: '0', start: '192.168.1.50' }], // no stop - unsized
          excludes: [],
          staticMappings: [],
        },
      ],
    })
    expect(computePoolUtilization(n, []).size).toBe(0)
  })

  it('clamps available at 0 when somehow oversubscribed', () => {
    const n = network({
      subnets: [
        {
          cidr: '192.168.1.0/24',
          options: { nameServers: [], ntpServers: [], domainSearch: [] },
          ranges: [{ id: '0', start: '192.168.1.1', stop: '192.168.1.1' }], // 1 address
          excludes: [],
          staticMappings: [],
        },
      ],
    })
    const leases = [lease(), lease({ macAddress: '00:00:00:00:00:02' })]
    const result = computePoolUtilization(n, leases)
    expect(result.size).toBe(1)
    expect(result.leased).toBe(2)
    expect(result.available).toBe(0)
    expect(result.usagePercent).toBe(100) // clamped, not 200
  })
})

function subnet(overrides: Partial<DHCPSubnet> = {}): DHCPSubnet {
  return {
    cidr: '192.168.1.0/24',
    options: { nameServers: [], ntpServers: [], domainSearch: [] },
    ranges: [{ id: '0', start: '192.168.1.50', stop: '192.168.1.100' }],
    excludes: [],
    staticMappings: [],
    ...overrides,
  }
}

describe('isAddressInDynamicRange', () => {
  it('is true for an address inside a configured range', () => {
    expect(isAddressInDynamicRange('192.168.1.75', subnet())).toBe(true)
  })

  it('is false for an address outside every range', () => {
    expect(isAddressInDynamicRange('192.168.1.200', subnet())).toBe(false)
  })

  it('is false for an address inside a range but individually excluded', () => {
    expect(isAddressInDynamicRange('192.168.1.75', subnet({ excludes: ['192.168.1.75'] }))).toBe(false)
  })

  it('is false for a blank address', () => {
    expect(isAddressInDynamicRange('', subnet())).toBe(false)
    expect(isAddressInDynamicRange('   ', subnet())).toBe(false)
  })

  it('ignores a range missing a start or stop bound', () => {
    const s = subnet({ ranges: [{ id: '0', start: '192.168.1.50' }] })
    expect(isAddressInDynamicRange('192.168.1.75', s)).toBe(false)
  })

  it('is false when there are no ranges at all', () => {
    expect(isAddressInDynamicRange('192.168.1.75', subnet({ ranges: [] }))).toBe(false)
  })
})
