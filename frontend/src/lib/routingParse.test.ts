import { describe, expect, it } from 'vitest'
import { parseStaticRoutes, staticRoutePath } from './routingParse'

describe('parseStaticRoutes', () => {
  it('parses a next-hop route with distance and disable', () => {
    const protocolsStatic = {
      route: {
        '192.0.2.0/24': {
          'next-hop': {
            '10.0.0.254': { distance: '10', disable: {} },
          },
        },
      },
    }

    const routes = parseStaticRoutes(protocolsStatic)
    expect(routes).toEqual([
      {
        family: 'ipv4',
        destination: '192.0.2.0/24',
        nextHops: [{ address: '10.0.0.254', disabled: true, distance: '10' }],
        interfaces: [],
        dhcpInterfaces: [],
        reject: undefined,
        blackhole: undefined,
      },
    ])
  })

  it('parses multiple next-hops for the same destination, sorted by address', () => {
    const protocolsStatic = {
      route: {
        '0.0.0.0/0': {
          'next-hop': {
            '10.0.0.2': {},
            '10.0.0.1': { distance: '5' },
          },
        },
      },
    }

    const routes = parseStaticRoutes(protocolsStatic)
    expect(routes[0].nextHops).toEqual([
      { address: '10.0.0.1', disabled: false, distance: '5' },
      { address: '10.0.0.2', disabled: false, distance: undefined },
    ])
  })

  it('parses interface routes', () => {
    const protocolsStatic = {
      route: {
        '192.0.2.0/24': {
          interface: {
            eth0: { distance: '20' },
          },
        },
      },
    }

    const routes = parseStaticRoutes(protocolsStatic)
    expect(routes[0].interfaces).toEqual([{ interfaceName: 'eth0', disabled: false, distance: '20' }])
  })

  it('parses dhcp-interface as a possibly multi-valued leaf', () => {
    const single = { route: { '192.0.2.0/24': { 'dhcp-interface': 'eth0' } } }
    expect(parseStaticRoutes(single)[0].dhcpInterfaces).toEqual(['eth0'])

    const multi = { route: { '192.0.2.0/24': { 'dhcp-interface': ['eth0', 'eth1'] } } }
    expect(parseStaticRoutes(multi)[0].dhcpInterfaces).toEqual(['eth0', 'eth1'])
  })

  it('parses a reject route with distance and tag', () => {
    const protocolsStatic = {
      route: {
        '192.0.2.0/24': { reject: { distance: '200', tag: '100' } },
      },
    }
    const routes = parseStaticRoutes(protocolsStatic)
    expect(routes[0].reject).toEqual({ distance: '200', tag: '100' })
    expect(routes[0].blackhole).toBeUndefined()
  })

  it('parses a blackhole route with no distance/tag set', () => {
    const protocolsStatic = {
      route: { '10.0.0.0/8': { blackhole: {} } },
    }
    const routes = parseStaticRoutes(protocolsStatic)
    expect(routes[0].blackhole).toEqual({ distance: undefined, tag: undefined })
    expect(routes[0].reject).toBeUndefined()
  })

  it('parses both ipv4 (route) and ipv6 (route6) destinations, family-tagged', () => {
    const protocolsStatic = {
      route: { '192.0.2.0/24': { 'next-hop': { '10.0.0.1': {} } } },
      route6: { '2001:db8::/32': { 'next-hop': { '2001:db8::1': {} } } },
    }

    const routes = parseStaticRoutes(protocolsStatic)
    expect(routes).toHaveLength(2)
    expect(routes.find((r) => r.destination === '192.0.2.0/24')?.family).toBe('ipv4')
    expect(routes.find((r) => r.destination === '2001:db8::/32')?.family).toBe('ipv6')
  })

  it('sorts by family then destination', () => {
    const protocolsStatic = {
      route: {
        '10.0.0.0/8': {},
        '192.0.2.0/24': {},
      },
      route6: {
        '2001:db8::/32': {},
      },
    }
    const routes = parseStaticRoutes(protocolsStatic)
    expect(routes.map((r) => `${r.family} ${r.destination}`)).toEqual([
      'ipv4 10.0.0.0/8',
      'ipv4 192.0.2.0/24',
      'ipv6 2001:db8::/32',
    ])
  })

  it('returns [] when protocols.static is absent', () => {
    expect(parseStaticRoutes({})).toEqual([])
    expect(parseStaticRoutes(undefined)).toEqual([])
  })

  it('handles a destination with no via configured at all (e.g. mid-edit)', () => {
    const protocolsStatic = { route: { '192.0.2.0/24': {} } }
    const routes = parseStaticRoutes(protocolsStatic)
    expect(routes).toEqual([
      {
        family: 'ipv4',
        destination: '192.0.2.0/24',
        nextHops: [],
        interfaces: [],
        dhcpInterfaces: [],
        reject: undefined,
        blackhole: undefined,
      },
    ])
  })
})

describe('staticRoutePath', () => {
  it('builds an ipv4 route path via protocols/static/route/<destination>', () => {
    expect(staticRoutePath('ipv4', '192.0.2.0/24', 'next-hop', '10.0.0.1')).toEqual([
      'protocols',
      'static',
      'route',
      '192.0.2.0/24',
      'next-hop',
      '10.0.0.1',
    ])
  })

  it('builds an ipv6 route path via protocols/static/route6/<destination>', () => {
    expect(staticRoutePath('ipv6', '2001:db8::/32', 'reject')).toEqual([
      'protocols',
      'static',
      'route6',
      '2001:db8::/32',
      'reject',
    ])
  })
})
