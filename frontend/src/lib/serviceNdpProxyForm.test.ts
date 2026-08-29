import { describe, expect, it } from 'vitest'
import {
  addNDPProxyPrefixOps,
  blankNDPProxyGlobalFormValues,
  blankNDPProxyInterfaceFormValues,
  deleteNDPProxyInterfaceOp,
  disableNDPProxyOp,
  enableNDPProxyOp,
  ndpProxyGlobalFormToOps,
  ndpProxyInterfaceFormToOps,
  ndpProxyInterfaceToFormValues,
  removeNDPProxyPrefixOp,
} from './serviceNdpProxyForm'
import { blankNDPProxyInterface, type NDPProxyInterface } from './serviceNdpProxyTypes'

function emptyInterface(overrides: Partial<NDPProxyInterface> = {}): NDPProxyInterface {
  return { interfaceName: 'eth0', ...blankNDPProxyInterface(), ...overrides }
}

describe('ndpProxyInterfaceFormToOps - creating', () => {
  it('always sets the interface tag itself, even with a blank form', () => {
    expect(ndpProxyInterfaceFormToOps('eth0', undefined, blankNDPProxyInterfaceFormValues())).toEqual([
      { op: 'set', path: ['service', 'ndp-proxy', 'interface', 'eth0'] },
    ])
  })

  it('queues flags and scalars', () => {
    const values = blankNDPProxyInterfaceFormValues()
    values.enableRouterBit = true
    values.timeout = '1000'

    expect(ndpProxyInterfaceFormToOps('eth0', undefined, values)).toEqual([
      { op: 'set', path: ['service', 'ndp-proxy', 'interface', 'eth0'] },
      { op: 'set', path: ['service', 'ndp-proxy', 'interface', 'eth0', 'enable-router-bit'] },
      { op: 'set', path: ['service', 'ndp-proxy', 'interface', 'eth0', 'timeout'], value: '1000' },
    ])
  })
})

describe('ndpProxyInterfaceFormToOps - editing', () => {
  it('queues nothing when unchanged (no base set re-issued)', () => {
    const iface = emptyInterface({ ttl: '30000' })
    expect(ndpProxyInterfaceFormToOps('eth0', iface, ndpProxyInterfaceToFormValues(iface))).toEqual([])
  })
})

describe('deleteNDPProxyInterfaceOp', () => {
  it('builds a delete op', () => {
    expect(deleteNDPProxyInterfaceOp('eth0')).toEqual({
      op: 'delete',
      path: ['service', 'ndp-proxy', 'interface', 'eth0'],
    })
  })
})

describe('prefix ops', () => {
  it('always sets the prefix tag, plus any given options', () => {
    const ops = addNDPProxyPrefixOps('eth0', '2001:db8::/64', {
      mode: 'auto',
      interfaceRef: '',
      disabled: true,
    })
    expect(ops).toEqual([
      { op: 'set', path: ['service', 'ndp-proxy', 'interface', 'eth0', 'prefix', '2001:db8::/64'] },
      { op: 'set', path: ['service', 'ndp-proxy', 'interface', 'eth0', 'prefix', '2001:db8::/64', 'mode'], value: 'auto' },
      { op: 'set', path: ['service', 'ndp-proxy', 'interface', 'eth0', 'prefix', '2001:db8::/64', 'disable'] },
    ])
  })

  it('builds a remove op', () => {
    expect(removeNDPProxyPrefixOp('eth0', '2001:db8::/64')).toEqual({
      op: 'delete',
      path: ['service', 'ndp-proxy', 'interface', 'eth0', 'prefix', '2001:db8::/64'],
    })
  })
})

describe('ndpProxyGlobalFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(ndpProxyGlobalFormToOps({}, blankNDPProxyGlobalFormValues())).toEqual([])
  })

  it('queues route-refresh', () => {
    const values = blankNDPProxyGlobalFormValues()
    values.routeRefresh = '60000'
    expect(ndpProxyGlobalFormToOps({}, values)).toEqual([
      { op: 'set', path: ['service', 'ndp-proxy', 'route-refresh'], value: '60000' },
    ])
  })
})

describe('enableNDPProxyOp / disableNDPProxyOp', () => {
  it('builds the expected ops', () => {
    expect(enableNDPProxyOp()).toEqual({ op: 'set', path: ['service', 'ndp-proxy'] })
    expect(disableNDPProxyOp()).toEqual({ op: 'delete', path: ['service', 'ndp-proxy'] })
  })
})
