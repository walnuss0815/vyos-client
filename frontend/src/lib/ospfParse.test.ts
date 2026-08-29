import { describe, expect, it } from 'vitest'
import { ospfAreaPath, ospfInterfacePath, ospfPath, parseOSPFConfig } from './ospfParse'

describe('parseOSPFConfig - global settings', () => {
  it('returns blank global settings and empty lists when both protocols are absent', () => {
    const config = parseOSPFConfig(undefined, undefined)
    expect(config.ospf.global.routerId).toBeUndefined()
    expect(config.ospf.global.defaultInformationOriginateAlways).toBe(false)
    expect(config.ospf.areas).toEqual([])
    expect(config.ospf.interfaces).toEqual([])
    expect(config.ospf.redistributions).toEqual([])
    expect(config.ospfv3.areas).toEqual([])
  })

  it('parses router-id, auto-cost, distance, default-information for ospf', () => {
    const ospf = {
      parameters: { 'router-id': '192.0.2.1' },
      'auto-cost': { 'reference-bandwidth': '1000' },
      distance: {
        global: '100',
        ospf: { external: '110', 'inter-area': '120', 'intra-area': '130' },
      },
      'default-information': {
        originate: { always: {}, metric: '10', 'metric-type': '2' },
      },
      'default-metric': '20',
    }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.global).toEqual({
      routerId: '192.0.2.1',
      autoCostReferenceBandwidth: '1000',
      distanceGlobal: '100',
      distanceExternal: '110',
      distanceInterArea: '120',
      distanceIntraArea: '130',
      defaultInformationOriginateAlways: true,
      defaultInformationOriginateMetric: '10',
      defaultInformationOriginateMetricType: '2',
      defaultMetric: '20',
    })
  })

  it('reads per-protocol distance under the "ospfv3" node for ospfv3, and has no default-metric', () => {
    const ospfv3 = {
      distance: { ospfv3: { external: '110' } },
    }
    const config = parseOSPFConfig(undefined, ospfv3)
    expect(config.ospfv3.global.distanceExternal).toBe('110')
    expect(config.ospfv3.global.defaultMetric).toBeUndefined()
  })
})

describe('parseOSPFConfig - areas', () => {
  it('parses a normal area with networks (ospf only)', () => {
    const ospf = { area: { '0': { network: ['192.0.2.0/24', '198.51.100.0/24'] } } }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.areas).toEqual([
      expect.objectContaining({
        id: '0',
        networks: ['192.0.2.0/24', '198.51.100.0/24'],
        areaType: undefined,
      }),
    ])
  })

  it('parses a single network as a one-element array', () => {
    const ospf = { area: { '0': { network: '192.0.2.0/24' } } }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.areas[0].networks).toEqual(['192.0.2.0/24'])
  })

  it('ospfv3 areas never have networks, even if somehow present in the tree', () => {
    const ospfv3 = { area: { '0': {} } }
    const config = parseOSPFConfig(undefined, ospfv3)
    expect(config.ospfv3.areas[0].networks).toEqual([])
  })

  it('parses a stub area with no-summary and default-cost', () => {
    const ospf = { area: { '1': { 'area-type': { stub: { 'no-summary': {}, 'default-cost': '50' } } } } }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.areas[0].areaType).toBe('stub')
    expect(config.ospf.areas[0].noSummary).toBe(true)
    expect(config.ospf.areas[0].defaultCost).toBe('50')
  })

  it('parses an nssa area with translate role (ospf only)', () => {
    const ospf = { area: { '1': { 'area-type': { nssa: { translate: 'always' } } } } }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.areas[0].areaType).toBe('nssa')
    expect(config.ospf.areas[0].nssaTranslate).toBe('always')
  })

  it('parses an nssa area with default-information-originate (ospfv3 only)', () => {
    const ospfv3 = { area: { '1': { 'area-type': { nssa: { 'default-information-originate': {} } } } } }
    const config = parseOSPFConfig(undefined, ospfv3)
    expect(config.ospfv3.areas[0].areaType).toBe('nssa')
    expect(config.ospfv3.areas[0].nssaDefaultInformationOriginate).toBe(true)
  })

  it('does not set nssaTranslate for ospfv3, or nssaDefaultInformationOriginate for ospf', () => {
    const ospf = { area: { '1': { 'area-type': { nssa: {} } } } }
    const ospfv3 = { area: { '1': { 'area-type': { nssa: {} } } } }
    const config = parseOSPFConfig(ospf, ospfv3)
    expect(config.ospf.areas[0].nssaDefaultInformationOriginate).toBe(false)
    expect(config.ospfv3.areas[0].nssaTranslate).toBeUndefined()
  })

  it('parses area authentication type (ospf only)', () => {
    const ospf = { area: { '0': { authentication: 'md5' } } }
    const ospfv3 = { area: { '0': {} } }
    const config = parseOSPFConfig(ospf, ospfv3)
    expect(config.ospf.areas[0].authentication).toBe('md5')
    expect(config.ospfv3.areas[0].authentication).toBeUndefined()
  })

  it('parses area ranges, with cost/substitute only for ospf', () => {
    const ospf = {
      area: {
        '0': {
          range: {
            '192.0.2.0/24': { cost: '10', substitute: '198.51.100.0/24' },
            '203.0.113.0/24': { 'not-advertise': {} },
          },
        },
      },
    }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.areas[0].ranges).toEqual([
      { prefix: '192.0.2.0/24', notAdvertise: false, cost: '10', substitute: '198.51.100.0/24' },
      { prefix: '203.0.113.0/24', notAdvertise: true, cost: undefined, substitute: undefined },
    ])
  })

  it('parses ospfv3 area ranges without cost/substitute', () => {
    const ospfv3 = { area: { '0': { range: { '2001:db8::/32': { 'not-advertise': {} } } } } }
    const config = parseOSPFConfig(undefined, ospfv3)
    expect(config.ospfv3.areas[0].ranges).toEqual([
      { prefix: '2001:db8::/32', notAdvertise: true, cost: undefined, substitute: undefined },
    ])
  })

  it('sorts areas by id', () => {
    const ospf = { area: { '2': {}, '0': {}, '10': {} } }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.areas.map((a) => a.id)).toEqual(['0', '10', '2'])
  })
})

describe('parseOSPFConfig - interfaces', () => {
  it('parses basic interface settings', () => {
    const ospf = {
      interface: {
        eth0: {
          area: '0',
          cost: '10',
          priority: '5',
          'dead-interval': '40',
          'hello-interval': '10',
          passive: {},
          network: 'point-to-point',
          'mtu-ignore': {},
          bfd: {},
        },
      },
    }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.interfaces).toEqual([
      expect.objectContaining({
        name: 'eth0',
        area: '0',
        cost: '10',
        priority: '5',
        deadInterval: '40',
        helloInterval: '10',
        passive: true,
        networkType: 'point-to-point',
        mtuIgnore: true,
        bfd: true,
      }),
    ])
  })

  it('sorts interfaces by name', () => {
    const ospf = { interface: { eth1: {}, eth0: {} } }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.interfaces.map((i) => i.name)).toEqual(['eth0', 'eth1'])
  })

  it('parses plaintext-password authentication (ospf only), without exposing the value', () => {
    const ospf = { interface: { eth0: { authentication: { 'plaintext-password': 'secret' } } } }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.interfaces[0].authMode).toBe('plaintext-password')
    expect(config.ospf.interfaces[0].hasPlaintextPassword).toBe(true)
    expect(config.ospf.interfaces[0]).not.toHaveProperty('plaintextPassword')
  })

  it('parses null authentication (ospf only)', () => {
    const ospf = { interface: { eth0: { authentication: { null: {} } } } }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.interfaces[0].authMode).toBe('null')
  })

  it('parses md5 authentication, taking the first key-id and never exposing the key', () => {
    const ospf = {
      interface: {
        eth0: {
          authentication: {
            md5: { 'key-id': { '2': { 'md5-key': 'secret' }, '1': { 'md5-key': 'secret2' } } },
          },
        },
      },
    }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.interfaces[0].authMode).toBe('md5')
    expect(config.ospf.interfaces[0].md5KeyId).toBe('1')
    expect(config.ospf.interfaces[0].hasMd5Key).toBe(true)
    expect(config.ospf.interfaces[0]).not.toHaveProperty('md5Key')
  })

  it('never sets authMode/auth flags for ospfv3', () => {
    const ospfv3 = { interface: { eth0: { area: '0' } } }
    const config = parseOSPFConfig(undefined, ospfv3)
    expect(config.ospfv3.interfaces[0].authMode).toBeUndefined()
    expect(config.ospfv3.interfaces[0].hasPlaintextPassword).toBe(false)
    expect(config.ospfv3.interfaces[0].hasMd5Key).toBe(false)
  })
})

describe('parseOSPFConfig - redistribution', () => {
  it('parses redistribution with metric and metric-type', () => {
    const ospf = { redistribute: { static: { metric: '20', 'metric-type': '1' }, connected: {} } }
    const config = parseOSPFConfig(ospf, undefined)
    expect(config.ospf.redistributions).toEqual([
      { source: 'connected', metric: undefined, metricType: undefined },
      { source: 'static', metric: '20', metricType: '1' },
    ])
  })
})

describe('path builders', () => {
  it('builds a global protocol path', () => {
    expect(ospfPath('ospf', 'default-metric')).toEqual(['protocols', 'ospf', 'default-metric'])
    expect(ospfPath('ospfv3', 'parameters', 'router-id')).toEqual([
      'protocols',
      'ospfv3',
      'parameters',
      'router-id',
    ])
  })

  it('builds an area path', () => {
    expect(ospfAreaPath('ospf', '0', 'network', '192.0.2.0/24')).toEqual([
      'protocols',
      'ospf',
      'area',
      '0',
      'network',
      '192.0.2.0/24',
    ])
  })

  it('builds an interface path', () => {
    expect(ospfInterfacePath('ospfv3', 'eth0', 'area')).toEqual([
      'protocols',
      'ospfv3',
      'interface',
      'eth0',
      'area',
    ])
  })
})
