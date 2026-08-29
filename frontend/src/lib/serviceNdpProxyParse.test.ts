import { describe, expect, it } from 'vitest'
import {
  ndpProxyInterfacePath,
  ndpProxyPath,
  ndpProxyPrefixPath,
  parseNDPProxyConfig,
} from './serviceNdpProxyParse'

describe('parseNDPProxyConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseNDPProxyConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseNDPProxyConfig({}).enabled).toBe(true)
  })

  it('parses route-refresh and interfaces with prefixes', () => {
    const ndp = {
      'route-refresh': '60000',
      interface: {
        eth0: {
          disable: {},
          'enable-router-bit': {},
          timeout: '1000',
          ttl: '60000',
          prefix: { '2001:db8::/64': { mode: 'auto' }, '2001:db8:1::': { mode: 'interface', interface: 'eth1' } },
        },
      },
    }
    const config = parseNDPProxyConfig(ndp)
    expect(config.routeRefresh).toBe('60000')
    expect(config.interfaces).toHaveLength(1)
    const iface = config.interfaces[0]
    expect(iface).toMatchObject({
      interfaceName: 'eth0',
      disabled: true,
      enableRouterBit: true,
      timeout: '1000',
      ttl: '60000',
    })
    expect(iface.prefixes).toEqual([
      { prefix: '2001:db8::/64', disabled: false, mode: 'auto', interface: undefined },
      { prefix: '2001:db8:1::', disabled: false, mode: 'interface', interface: 'eth1' },
    ])
  })
})

describe('path builders', () => {
  it('builds base, interface, and prefix paths', () => {
    expect(ndpProxyPath('route-refresh')).toEqual(['service', 'ndp-proxy', 'route-refresh'])
    expect(ndpProxyInterfacePath('eth0', 'timeout')).toEqual([
      'service',
      'ndp-proxy',
      'interface',
      'eth0',
      'timeout',
    ])
    expect(ndpProxyPrefixPath('eth0', '2001:db8::/64', 'mode')).toEqual([
      'service',
      'ndp-proxy',
      'interface',
      'eth0',
      'prefix',
      '2001:db8::/64',
      'mode',
    ])
  })
})
