import { describe, expect, it } from 'vitest'
import {
  blankSimpleClassfulClassFormValues,
  deleteSimpleClassfulClassOp,
  deleteSimpleClassfulPolicyOp,
  simpleClassfulClassFormToOps,
  simpleClassfulClassToFormValues,
  simpleClassfulDefaultClassFormToOps,
  simpleClassfulDefaultClassToFormValues,
  simpleClassfulPolicyFormToOps,
} from './qosSimpleClassfulForm'
import type { QosSimpleClassfulClass, QosSimpleClassfulDefaultClass } from './qosTypes'

describe('simple classful policy form (priority-queue / round-robin)', () => {
  it('creates a new policy with a description', () => {
    const ops = simpleClassfulPolicyFormToOps('priority-queue', 'P', undefined, { description: 'voice priority' })
    expect(ops).toEqual([
      { op: 'set', path: ['qos', 'policy', 'priority-queue', 'P'] },
      { op: 'set', path: ['qos', 'policy', 'priority-queue', 'P', 'description'], value: 'voice priority' },
    ])
  })

  it('deleteSimpleClassfulPolicyOp deletes the whole policy tagNode', () => {
    expect(deleteSimpleClassfulPolicyOp('round-robin', 'R')).toEqual({
      op: 'delete',
      path: ['qos', 'policy', 'round-robin', 'R'],
    })
  })
})

describe('simple classful class form', () => {
  it('includes quantum for round-robin but not for priority-queue', () => {
    const values = { ...blankSimpleClassfulClassFormValues('drop-tail'), quantum: '1500' }
    const rrOps = simpleClassfulClassFormToOps('round-robin', 'R', '1', undefined, values)
    expect(rrOps).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'round-robin', 'R', 'class', '1', 'quantum'],
      value: '1500',
    })

    const pqOps = simpleClassfulClassFormToOps('priority-queue', 'P', '1', undefined, values)
    expect(pqOps.some((o) => o.path.at(-1) === 'quantum')).toBe(false)
  })

  it('emits nothing when editing with no changes', () => {
    const before: QosSimpleClassfulClass = { id: '1', queueType: 'drop-tail', matches: [], matchGroups: [] }
    const ops = simpleClassfulClassFormToOps(
      'priority-queue',
      'P',
      '1',
      before,
      simpleClassfulClassToFormValues(before),
    )
    expect(ops).toEqual([])
  })

  it('deleteSimpleClassfulClassOp deletes the class tagNode', () => {
    expect(deleteSimpleClassfulClassOp('priority-queue', 'P', '1')).toEqual({
      op: 'delete',
      path: ['qos', 'policy', 'priority-queue', 'P', 'class', '1'],
    })
  })
})

describe('simple classful default class form', () => {
  it('only emits ops for fields that changed', () => {
    const before: QosSimpleClassfulDefaultClass = { queueType: 'fair-queue' }
    const beforeValues = simpleClassfulDefaultClassToFormValues(before)
    const values = { ...beforeValues, target: '5' }
    const ops = simpleClassfulDefaultClassFormToOps('round-robin', 'R', beforeValues, values)
    expect(ops).toEqual([{ op: 'set', path: ['qos', 'policy', 'round-robin', 'R', 'default', 'target'], value: '5' }])
  })
})
