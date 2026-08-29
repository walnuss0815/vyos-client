import { describe, expect, it } from 'vitest'
import {
  parseRouterAdvertConfig,
  routerAdvertInterfacePath,
  routerAdvertPath,
  routerAdvertPrefixPath,
  routerAdvertRoutePath,
} from './serviceRouterAdvertParse'

describe('parseRouterAdvertConfig', () => {
  it('returns a blank config when absent', () => {
    expect(parseRouterAdvertConfig(undefined)).toEqual({ interfaces: [] })
  })

  it('parses an interface with scalar fields, interval, and flags', () => {
    const ra = {
      interface: {
        eth0: {
          'hop-limit': '32',
          'default-preference': 'high',
          interval: { max: '400', min: '100' },
          'managed-flag': {},
          'other-config-flag': {},
          'no-send-advert': {},
        },
      },
    }
    const config = parseRouterAdvertConfig(ra)
    expect(config.interfaces).toHaveLength(1)
    expect(config.interfaces[0]).toMatchObject({
      interfaceName: 'eth0',
      hopLimit: '32',
      defaultPreference: 'high',
      intervalMax: '400',
      intervalMin: '100',
      managedFlag: true,
      otherConfigFlag: true,
      noSendAdvert: true,
    })
  })

  it('parses dnssl, name-server, and source-address as multi-valued', () => {
    const ra = {
      interface: {
        eth0: {
          dnssl: ['example.com'],
          'name-server': ['2001:db8::1'],
          'source-address': ['2001:db8::2'],
        },
      },
    }
    const [iface] = parseRouterAdvertConfig(ra).interfaces
    expect(iface.dnssl).toEqual(['example.com'])
    expect(iface.nameServers).toEqual(['2001:db8::1'])
    expect(iface.sourceAddresses).toEqual(['2001:db8::2'])
  })

  it('parses prefix entries', () => {
    const ra = {
      interface: {
        eth0: {
          prefix: {
            '2001:db8::/64': {
              'no-autonomous-flag': {},
              'preferred-lifetime': 'infinity',
              'valid-lifetime': '2592000',
            },
          },
        },
      },
    }
    const [iface] = parseRouterAdvertConfig(ra).interfaces
    expect(iface.prefixes).toEqual([
      {
        prefix: '2001:db8::/64',
        noAutonomousFlag: true,
        noOnLinkFlag: false,
        deprecatePrefix: false,
        decrementLifetime: false,
        baseInterface: undefined,
        preferredLifetime: 'infinity',
        validLifetime: '2592000',
      },
    ])
  })

  it('parses route entries', () => {
    const ra = {
      interface: {
        eth0: {
          route: { '2001:db8:1::/64': { 'valid-lifetime': 'infinity', 'route-preference': 'high' } },
        },
      },
    }
    const [iface] = parseRouterAdvertConfig(ra).interfaces
    expect(iface.routes).toEqual([
      { prefix: '2001:db8:1::/64', validLifetime: 'infinity', routePreference: 'high', noRemoveRoute: false },
    ])
  })

  it('sorts interfaces by name', () => {
    const ra = { interface: { eth1: {}, eth0: {} } }
    const config = parseRouterAdvertConfig(ra)
    expect(config.interfaces.map((i) => i.interfaceName)).toEqual(['eth0', 'eth1'])
  })
})

describe('path builders', () => {
  it('builds base and interface paths', () => {
    expect(routerAdvertPath('interface')).toEqual(['service', 'router-advert', 'interface'])
    expect(routerAdvertInterfacePath('eth0', 'hop-limit')).toEqual([
      'service',
      'router-advert',
      'interface',
      'eth0',
      'hop-limit',
    ])
  })

  it('builds prefix and route paths', () => {
    expect(routerAdvertPrefixPath('eth0', '2001:db8::/64', 'valid-lifetime')).toEqual([
      'service',
      'router-advert',
      'interface',
      'eth0',
      'prefix',
      '2001:db8::/64',
      'valid-lifetime',
    ])
    expect(routerAdvertRoutePath('eth0', '2001:db8:1::/64', 'route-preference')).toEqual([
      'service',
      'router-advert',
      'interface',
      'eth0',
      'route',
      '2001:db8:1::/64',
      'route-preference',
    ])
  })
})
