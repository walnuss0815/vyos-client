import { describe, expect, it } from 'vitest'
import {
  blankBroadcastRelayInstanceFormValues,
  broadcastRelayInstanceFormToOps,
  broadcastRelayInstanceToFormValues,
  deleteBroadcastRelayInstanceOp,
  disableBroadcastRelayOp,
  enableBroadcastRelayOp,
  toggleBroadcastRelayServiceDisableOp,
} from './serviceBroadcastRelayForm'
import { blankBroadcastRelayInstance, type BroadcastRelayInstance } from './serviceBroadcastRelayTypes'

function emptyInstance(overrides: Partial<BroadcastRelayInstance> = {}): BroadcastRelayInstance {
  return { id: '5', ...blankBroadcastRelayInstance(), ...overrides }
}

describe('broadcastRelayInstanceFormToOps - creating', () => {
  it('always sets the instance tag itself, even with a blank form', () => {
    expect(broadcastRelayInstanceFormToOps('5', undefined, blankBroadcastRelayInstanceFormValues())).toEqual([
      { op: 'set', path: ['service', 'broadcast-relay', 'id', '5'] },
    ])
  })

  it('queues scalar and flag fields alongside the base set', () => {
    const values = blankBroadcastRelayInstanceFormValues()
    values.address = '192.0.2.1'
    values.disabled = true

    expect(broadcastRelayInstanceFormToOps('5', undefined, values)).toEqual([
      { op: 'set', path: ['service', 'broadcast-relay', 'id', '5'] },
      { op: 'set', path: ['service', 'broadcast-relay', 'id', '5', 'disable'] },
      { op: 'set', path: ['service', 'broadcast-relay', 'id', '5', 'address'], value: '192.0.2.1' },
    ])
  })
})

describe('broadcastRelayInstanceFormToOps - editing', () => {
  it('queues nothing when unchanged (no base set re-issued)', () => {
    const instance = emptyInstance({ port: '9' })
    expect(
      broadcastRelayInstanceFormToOps('5', instance, broadcastRelayInstanceToFormValues(instance)),
    ).toEqual([])
  })
})

describe('deleteBroadcastRelayInstanceOp', () => {
  it('builds a delete op', () => {
    expect(deleteBroadcastRelayInstanceOp('5')).toEqual({
      op: 'delete',
      path: ['service', 'broadcast-relay', 'id', '5'],
    })
  })
})

describe('enable/disable ops', () => {
  it('builds the expected ops', () => {
    expect(enableBroadcastRelayOp()).toEqual({ op: 'set', path: ['service', 'broadcast-relay'] })
    expect(disableBroadcastRelayOp()).toEqual({ op: 'delete', path: ['service', 'broadcast-relay'] })
  })

  it('toggles the service-level disable flag independently of instance-level disable', () => {
    expect(toggleBroadcastRelayServiceDisableOp(true)).toEqual({
      op: 'set',
      path: ['service', 'broadcast-relay', 'disable'],
    })
    expect(toggleBroadcastRelayServiceDisableOp(false)).toEqual({
      op: 'delete',
      path: ['service', 'broadcast-relay', 'disable'],
    })
  })
})
