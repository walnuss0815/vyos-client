import { describe, expect, it } from 'vitest'
import type { DHCPSharedNetwork } from './dhcpConfigTypes'
import {
  buildStaticMappingIndex,
  existingStaticMappingNames,
  findStaticMapping,
  findStaticMappingIndexed,
  groupLeasesByPool,
  suggestStaticMappingName,
  UNKNOWN_POOL_LABEL,
} from './dhcpLeases'
import type { DHCPLease } from './vyosApi'

function lease(overrides: Partial<DHCPLease>): DHCPLease {
  return {
    ipAddress: '192.168.1.134',
    macAddress: '00:50:79:66:68:09',
    state: 'active',
    leaseStart: '2023/11/29 09:51:05',
    leaseEnd: '2023/11/29 10:21:05',
    remaining: '0:24:10',
    pool: 'LAN',
    hostname: '',
    origin: 'local',
    subnet: '192.168.1.0/24',
    ...overrides,
  }
}

describe('suggestStaticMappingName', () => {
  it('uses the hostname when it is a valid VyOS identifier', () => {
    expect(suggestStaticMappingName(lease({ hostname: 'VPCS1' }))).toBe('VPCS1')
  })

  it('falls back to a MAC-derived name when hostname is empty', () => {
    expect(suggestStaticMappingName(lease({ hostname: '' }))).toBe('device-005079666809')
  })

  it('falls back to a MAC-derived name for the "-" placeholder hostname', () => {
    expect(suggestStaticMappingName(lease({ hostname: '-' }))).toBe('device-005079666809')
  })

  it('falls back to a MAC-derived name when the hostname is not a valid VyOS identifier', () => {
    expect(suggestStaticMappingName(lease({ hostname: 'my printer.local' }))).toBe(
      'device-005079666809',
    )
  })
})

describe('existingStaticMappingNames', () => {
  const sharedNetworks: DHCPSharedNetwork[] = [
    {
      name: 'LAN',
      authoritative: true,
      options: { nameServers: [], ntpServers: [], domainSearch: [] },
      subnets: [
        {
          cidr: '192.168.1.0/24',
          options: { nameServers: [], ntpServers: [], domainSearch: [] },
          ranges: [],
          excludes: [],
          staticMappings: [
            { name: 'printer', mac: 'aa:bb:cc:dd:ee:ff' },
            { name: 'VPCS1', mac: '00:50:79:66:68:09' },
          ],
        },
      ],
    },
  ]

  it("returns the subnet's static-mapping names when the lease's pool/subnet match", () => {
    expect(existingStaticMappingNames(lease({}), sharedNetworks)).toEqual(['printer', 'VPCS1'])
  })

  it('returns an empty array when the lease has no resolved subnet', () => {
    expect(existingStaticMappingNames(lease({ subnet: undefined }), sharedNetworks)).toEqual([])
  })

  it('returns an empty array when no shared network matches the pool', () => {
    expect(existingStaticMappingNames(lease({ pool: 'WIFI' }), sharedNetworks)).toEqual([])
  })

  it('returns an empty array when no subnet matches the CIDR', () => {
    expect(existingStaticMappingNames(lease({ subnet: '10.0.0.0/24' }), sharedNetworks)).toEqual([])
  })
})

describe('findStaticMapping', () => {
  const sharedNetworks: DHCPSharedNetwork[] = [
    {
      name: 'LAN',
      authoritative: true,
      options: { nameServers: [], ntpServers: [], domainSearch: [] },
      subnets: [
        {
          cidr: '192.168.1.0/24',
          options: { nameServers: [], ntpServers: [], domainSearch: [] },
          ranges: [],
          excludes: [],
          staticMappings: [
            { name: 'printer', mac: 'aa:bb:cc:dd:ee:ff' },
            { name: 'VPCS1', mac: '00:50:79:66:68:09' },
            { name: 'duid-only', duid: '00:01:02:03' },
          ],
        },
      ],
    },
  ]

  it("finds the mapping whose mac matches the lease's macAddress", () => {
    expect(findStaticMapping(lease({}), sharedNetworks)).toEqual({
      name: 'VPCS1',
      mac: '00:50:79:66:68:09',
    })
  })

  it('matches case-insensitively', () => {
    expect(findStaticMapping(lease({ macAddress: '00:50:79:66:68:09'.toUpperCase() }), sharedNetworks)).toEqual({
      name: 'VPCS1',
      mac: '00:50:79:66:68:09',
    })
  })

  it('returns undefined when no mapping has a matching mac', () => {
    expect(findStaticMapping(lease({ macAddress: '11:22:33:44:55:66' }), sharedNetworks)).toBeUndefined()
  })

  it('never matches a DUID-only mapping - leases carry no DUID of their own', () => {
    // Sanity check that the duid-only fixture entry is otherwise
    // well-formed and doesn't accidentally match on an empty mac.
    expect(findStaticMapping(lease({ macAddress: '' }), sharedNetworks)).toBeUndefined()
  })

  it('returns undefined when the lease has no resolved subnet', () => {
    expect(findStaticMapping(lease({ subnet: undefined }), sharedNetworks)).toBeUndefined()
  })

  it('returns undefined when no shared network matches the pool', () => {
    expect(findStaticMapping(lease({ pool: 'WIFI' }), sharedNetworks)).toBeUndefined()
  })
})

// Regression/equivalence tests for the DHCPLeasesTable.tsx perf fix:
// buildStaticMappingIndex + findStaticMappingIndexed replace
// findStaticMapping's per-lease linear scan with a single precomputed
// Map, for tables with hundreds/thousands of leases. Reuses the exact
// same fixture and test cases as the findStaticMapping suite above to
// prove they agree on every case, not just the happy path.
describe('findStaticMappingIndexed', () => {
  const sharedNetworks: DHCPSharedNetwork[] = [
    {
      name: 'LAN',
      authoritative: true,
      options: { nameServers: [], ntpServers: [], domainSearch: [] },
      subnets: [
        {
          cidr: '192.168.1.0/24',
          options: { nameServers: [], ntpServers: [], domainSearch: [] },
          ranges: [],
          excludes: [],
          staticMappings: [
            { name: 'printer', mac: 'aa:bb:cc:dd:ee:ff' },
            { name: 'VPCS1', mac: '00:50:79:66:68:09' },
            { name: 'duid-only', duid: '00:01:02:03' },
          ],
        },
      ],
    },
  ]
  const index = buildStaticMappingIndex(sharedNetworks)

  it("finds the mapping whose mac matches the lease's macAddress", () => {
    expect(findStaticMappingIndexed(lease({}), index)).toEqual({
      name: 'VPCS1',
      mac: '00:50:79:66:68:09',
    })
  })

  it('matches case-insensitively', () => {
    expect(findStaticMappingIndexed(lease({ macAddress: '00:50:79:66:68:09'.toUpperCase() }), index)).toEqual({
      name: 'VPCS1',
      mac: '00:50:79:66:68:09',
    })
  })

  it('returns undefined when no mapping has a matching mac', () => {
    expect(findStaticMappingIndexed(lease({ macAddress: '11:22:33:44:55:66' }), index)).toBeUndefined()
  })

  it('never matches a DUID-only mapping - leases carry no DUID of their own', () => {
    expect(findStaticMappingIndexed(lease({ macAddress: '' }), index)).toBeUndefined()
  })

  it('returns undefined when the lease has no resolved subnet', () => {
    expect(findStaticMappingIndexed(lease({ subnet: undefined }), index)).toBeUndefined()
  })

  it('returns undefined when no shared network matches the pool', () => {
    expect(findStaticMappingIndexed(lease({ pool: 'WIFI' }), index)).toBeUndefined()
  })

  it('agrees with findStaticMapping across a whole set of leases, not just one case at a time', () => {
    const leases = [
      lease({}),
      lease({ macAddress: '00:50:79:66:68:09'.toUpperCase() }),
      lease({ macAddress: '11:22:33:44:55:66' }),
      lease({ macAddress: '' }),
      lease({ subnet: undefined }),
      lease({ pool: 'WIFI' }),
    ]
    for (const l of leases) {
      expect(findStaticMappingIndexed(l, index)).toEqual(findStaticMapping(l, sharedNetworks))
    }
  })

  it('keeps two pools with the same subnet CIDR from colliding in the index', () => {
    const twoNetworks: DHCPSharedNetwork[] = [
      {
        name: 'LAN',
        authoritative: true,
        options: { nameServers: [], ntpServers: [], domainSearch: [] },
        subnets: [
          {
            cidr: '10.0.0.0/24',
            options: { nameServers: [], ntpServers: [], domainSearch: [] },
            ranges: [],
            excludes: [],
            staticMappings: [{ name: 'lan-device', mac: 'aa:aa:aa:aa:aa:aa' }],
          },
        ],
      },
      {
        name: 'GUEST',
        authoritative: true,
        options: { nameServers: [], ntpServers: [], domainSearch: [] },
        subnets: [
          {
            cidr: '10.0.0.0/24', // same CIDR as LAN's subnet, different pool
            options: { nameServers: [], ntpServers: [], domainSearch: [] },
            ranges: [],
            excludes: [],
            staticMappings: [{ name: 'guest-device', mac: 'aa:aa:aa:aa:aa:aa' }], // same mac too
          },
        ],
      },
    ]
    const twoNetworkIndex = buildStaticMappingIndex(twoNetworks)

    const lanLease = lease({ pool: 'LAN', subnet: '10.0.0.0/24', macAddress: 'aa:aa:aa:aa:aa:aa' })
    const guestLease = lease({ pool: 'GUEST', subnet: '10.0.0.0/24', macAddress: 'aa:aa:aa:aa:aa:aa' })

    expect(findStaticMappingIndexed(lanLease, twoNetworkIndex)?.name).toBe('lan-device')
    expect(findStaticMappingIndexed(guestLease, twoNetworkIndex)?.name).toBe('guest-device')
  })
})

describe('groupLeasesByPool', () => {
  it('groups leases by pool, sorted alphabetically by pool name', () => {
    const wifi = lease({ pool: 'WIFI', ipAddress: '192.168.2.1' })
    const lan1 = lease({ pool: 'LAN', ipAddress: '192.168.1.1' })
    const lan2 = lease({ pool: 'LAN', ipAddress: '192.168.1.2' })

    const groups = groupLeasesByPool([wifi, lan1, lan2])

    expect(groups).toEqual([
      { pool: 'LAN', leases: [lan1, lan2] },
      { pool: 'WIFI', leases: [wifi] },
    ])
  })

  it('groups leases with no resolved pool under the "Unknown" label', () => {
    const noPool = lease({ pool: '' })
    const groups = groupLeasesByPool([noPool])
    expect(groups).toEqual([{ pool: UNKNOWN_POOL_LABEL, leases: [noPool] }])
  })

  it('treats a whitespace-only pool the same as an empty one', () => {
    const noPool = lease({ pool: '   ' })
    const groups = groupLeasesByPool([noPool])
    expect(groups).toEqual([{ pool: UNKNOWN_POOL_LABEL, leases: [noPool] }])
  })

  it('returns an empty array for an empty lease list', () => {
    expect(groupLeasesByPool([])).toEqual([])
  })
})
