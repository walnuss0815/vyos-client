import { describe, expect, it } from 'vitest'
import {
  addRouterAdvertPrefixOps,
  addRouterAdvertRouteOps,
  blankRouterAdvertInterfaceFormValues,
  deleteRouterAdvertInterfaceOp,
  removeRouterAdvertPrefixOp,
  removeRouterAdvertRouteOp,
  routerAdvertInterfaceFormToOps,
  routerAdvertInterfaceToFormValues,
} from './serviceRouterAdvertForm'
import { blankRouterAdvertInterface, type RouterAdvertInterface } from './serviceRouterAdvertTypes'

function emptyInterface(overrides: Partial<RouterAdvertInterface> = {}): RouterAdvertInterface {
  return { interfaceName: 'eth0', ...blankRouterAdvertInterface(), ...overrides }
}

describe('routerAdvertInterfaceFormToOps - creating a new interface', () => {
  it('always sets the interface tag itself (enables RA), even with a blank form', () => {
    expect(routerAdvertInterfaceFormToOps('eth0', undefined, blankRouterAdvertInterfaceFormValues())).toEqual([
      { op: 'set', path: ['service', 'router-advert', 'interface', 'eth0'] },
    ])
  })

  it('queues scalar and flag fields alongside the base set', () => {
    const values = blankRouterAdvertInterfaceFormValues()
    values.hopLimit = '32'
    values.managedFlag = true

    const ops = routerAdvertInterfaceFormToOps('eth0', undefined, values)
    expect(ops).toEqual([
      { op: 'set', path: ['service', 'router-advert', 'interface', 'eth0'] },
      { op: 'set', path: ['service', 'router-advert', 'interface', 'eth0', 'hop-limit'], value: '32' },
      { op: 'set', path: ['service', 'router-advert', 'interface', 'eth0', 'managed-flag'] },
    ])
  })

  it('queues nested interval fields', () => {
    const values = blankRouterAdvertInterfaceFormValues()
    values.intervalMax = '400'

    const ops = routerAdvertInterfaceFormToOps('eth0', undefined, values)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['service', 'router-advert', 'interface', 'eth0', 'interval', 'max'],
      value: '400',
    })
  })
})

describe('routerAdvertInterfaceFormToOps - editing an existing interface', () => {
  it('queues nothing when unchanged (no base set re-issued)', () => {
    const iface = emptyInterface({ hopLimit: '32' })
    expect(routerAdvertInterfaceFormToOps('eth0', iface, routerAdvertInterfaceToFormValues(iface))).toEqual([])
  })

  it('queues a delete when a flag is unchecked', () => {
    const iface = emptyInterface({ managedFlag: true })
    const values = routerAdvertInterfaceToFormValues(iface)
    values.managedFlag = false

    expect(routerAdvertInterfaceFormToOps('eth0', iface, values)).toEqual([
      { op: 'delete', path: ['service', 'router-advert', 'interface', 'eth0', 'managed-flag'] },
    ])
  })
})

describe('deleteRouterAdvertInterfaceOp', () => {
  it('builds a delete op for the whole interface entry', () => {
    expect(deleteRouterAdvertInterfaceOp('eth0')).toEqual({
      op: 'delete',
      path: ['service', 'router-advert', 'interface', 'eth0'],
    })
  })
})

describe('prefix ops', () => {
  it('always sets the prefix tag, plus any enabled options', () => {
    const ops = addRouterAdvertPrefixOps('eth0', '2001:db8::/64', {
      noAutonomousFlag: true,
      noOnLinkFlag: false,
      deprecatePrefix: false,
      decrementLifetime: false,
      baseInterface: '',
      preferredLifetime: 'infinity',
      validLifetime: '',
    })
    expect(ops).toEqual([
      { op: 'set', path: ['service', 'router-advert', 'interface', 'eth0', 'prefix', '2001:db8::/64'] },
      {
        op: 'set',
        path: ['service', 'router-advert', 'interface', 'eth0', 'prefix', '2001:db8::/64', 'no-autonomous-flag'],
      },
      {
        op: 'set',
        path: ['service', 'router-advert', 'interface', 'eth0', 'prefix', '2001:db8::/64', 'preferred-lifetime'],
        value: 'infinity',
      },
    ])
  })

  it('builds a remove op', () => {
    expect(removeRouterAdvertPrefixOp('eth0', '2001:db8::/64')).toEqual({
      op: 'delete',
      path: ['service', 'router-advert', 'interface', 'eth0', 'prefix', '2001:db8::/64'],
    })
  })
})

describe('route ops', () => {
  it('always sets the route tag, plus any enabled options', () => {
    const ops = addRouterAdvertRouteOps('eth0', '2001:db8:1::/64', {
      validLifetime: 'infinity',
      routePreference: 'high',
      noRemoveRoute: true,
    })
    expect(ops).toEqual([
      { op: 'set', path: ['service', 'router-advert', 'interface', 'eth0', 'route', '2001:db8:1::/64'] },
      {
        op: 'set',
        path: ['service', 'router-advert', 'interface', 'eth0', 'route', '2001:db8:1::/64', 'valid-lifetime'],
        value: 'infinity',
      },
      {
        op: 'set',
        path: ['service', 'router-advert', 'interface', 'eth0', 'route', '2001:db8:1::/64', 'route-preference'],
        value: 'high',
      },
      {
        op: 'set',
        path: ['service', 'router-advert', 'interface', 'eth0', 'route', '2001:db8:1::/64', 'no-remove-route'],
      },
    ])
  })

  it('builds a remove op', () => {
    expect(removeRouterAdvertRouteOp('eth0', '2001:db8:1::/64')).toEqual({
      op: 'delete',
      path: ['service', 'router-advert', 'interface', 'eth0', 'route', '2001:db8:1::/64'],
    })
  })
})
