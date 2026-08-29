import { describe, expect, it } from 'vitest'
import {
  blankContainerNetworkFormValues,
  containerNetworkFormToOps,
  containerNetworkToFormValues,
  deleteContainerNetworkOp,
} from './containerNetworkForm'
import { blankContainerNetwork, type ContainerNetwork } from './containerTypes'

function emptyNetwork(overrides: Partial<ContainerNetwork> = {}): ContainerNetwork {
  return { name: 'NET01', ...blankContainerNetwork(), ...overrides }
}

describe('containerNetworkFormToOps - creating a new network', () => {
  it('queues nothing for a blank form', () => {
    expect(containerNetworkFormToOps('NET01', undefined, blankContainerNetworkFormValues())).toEqual([])
  })

  it('queues description, mtu, and vrf', () => {
    const values = blankContainerNetworkFormValues()
    values.description = 'Container LAN'
    values.mtu = '1500'
    values.vrf = 'RED'

    expect(containerNetworkFormToOps('NET01', undefined, values)).toEqual([
      { op: 'set', path: ['container', 'network', 'NET01', 'description'], value: 'Container LAN' },
      { op: 'set', path: ['container', 'network', 'NET01', 'mtu'], value: '1500' },
      { op: 'set', path: ['container', 'network', 'NET01', 'vrf'], value: 'RED' },
    ])
  })

  it('queues no-name-server', () => {
    const values = blankContainerNetworkFormValues()
    values.noNameServer = true
    expect(containerNetworkFormToOps('NET01', undefined, values)).toEqual([
      { op: 'set', path: ['container', 'network', 'NET01', 'no-name-server'] },
    ])
  })

  it('queues bridge type', () => {
    const values = blankContainerNetworkFormValues()
    values.type = 'bridge'
    expect(containerNetworkFormToOps('NET01', undefined, values)).toEqual([
      { op: 'set', path: ['container', 'network', 'NET01', 'type', 'bridge'] },
    ])
  })

  it('queues macvlan type with mode and parent', () => {
    const values = blankContainerNetworkFormValues()
    values.type = 'macvlan'
    values.macvlanMode = 'bridge'
    values.macvlanParent = 'eth0'
    expect(containerNetworkFormToOps('NET01', undefined, values)).toEqual([
      { op: 'set', path: ['container', 'network', 'NET01', 'type', 'macvlan'] },
      { op: 'set', path: ['container', 'network', 'NET01', 'type', 'macvlan', 'mode'], value: 'bridge' },
      { op: 'set', path: ['container', 'network', 'NET01', 'type', 'macvlan', 'parent'], value: 'eth0' },
    ])
  })
})

describe('containerNetworkFormToOps - editing an existing network', () => {
  it('queues nothing when unchanged', () => {
    const network = emptyNetwork({ type: 'bridge' })
    expect(containerNetworkFormToOps('NET01', network, containerNetworkToFormValues(network))).toEqual([])
  })

  it('deletes the old type variant before setting a new one when switching bridge -> macvlan', () => {
    const network = emptyNetwork({ type: 'bridge' })
    const values = containerNetworkToFormValues(network)
    values.type = 'macvlan'
    values.macvlanMode = 'vepa'

    expect(containerNetworkFormToOps('NET01', network, values)).toEqual([
      { op: 'delete', path: ['container', 'network', 'NET01', 'type'] },
      { op: 'set', path: ['container', 'network', 'NET01', 'type', 'macvlan'] },
      { op: 'set', path: ['container', 'network', 'NET01', 'type', 'macvlan', 'mode'], value: 'vepa' },
    ])
  })

  it('diffs macvlan mode/parent directly without delete+recreate when type stays macvlan', () => {
    const network = emptyNetwork({ type: 'macvlan', macvlan: { mode: 'bridge', parent: 'eth0' } })
    const values = containerNetworkToFormValues(network)
    values.macvlanMode = 'private'

    expect(containerNetworkFormToOps('NET01', network, values)).toEqual([
      { op: 'set', path: ['container', 'network', 'NET01', 'type', 'macvlan', 'mode'], value: 'private' },
    ])
  })

  it('clears the type entirely when set back to unset', () => {
    const network = emptyNetwork({ type: 'bridge' })
    const values = containerNetworkToFormValues(network)
    values.type = ''

    expect(containerNetworkFormToOps('NET01', network, values)).toEqual([
      { op: 'delete', path: ['container', 'network', 'NET01', 'type'] },
    ])
  })
})

describe('deleteContainerNetworkOp', () => {
  it('builds a delete op for the whole network', () => {
    expect(deleteContainerNetworkOp('NET01')).toEqual({
      op: 'delete',
      path: ['container', 'network', 'NET01'],
    })
  })
})
