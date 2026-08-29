import { describe, expect, it } from 'vitest'
import {
  blankLimiterClassFormValues,
  deleteLimiterClassOp,
  deleteLimiterPolicyOp,
  limiterClassFormToOps,
  limiterClassToFormValues,
  limiterDefaultClassFormToOps,
  limiterDefaultClassToFormValues,
  limiterPolicyFormToOps,
} from './qosLimiterForm'
import type { QosLimiterClass, QosLimiterDefaultClass } from './qosTypes'

describe('limiter policy form', () => {
  it('creates a new policy with a bare set plus description', () => {
    const ops = limiterPolicyFormToOps('IN', undefined, { description: 'inbound limiter' })
    expect(ops).toEqual([
      { op: 'set', path: ['qos', 'policy', 'limiter', 'IN'] },
      { op: 'set', path: ['qos', 'policy', 'limiter', 'IN', 'description'], value: 'inbound limiter' },
    ])
  })

  it('deleteLimiterPolicyOp deletes the whole policy tagNode', () => {
    expect(deleteLimiterPolicyOp('IN')).toEqual({ op: 'delete', path: ['qos', 'policy', 'limiter', 'IN'] })
  })
})

describe('limiter class form', () => {
  it('creates a new class with police fields', () => {
    const values = { ...blankLimiterClassFormValues(), bandwidth: '10mbit', policeExceed: 'reclassify' }
    const ops = limiterClassFormToOps('IN', '1', undefined, values)
    expect(ops[0]).toEqual({ op: 'set', path: ['qos', 'policy', 'limiter', 'IN', 'class', '1'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'limiter', 'IN', 'class', '1', 'bandwidth'],
      value: '10mbit',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'limiter', 'IN', 'class', '1', 'exceed'],
      value: 'reclassify',
    })
  })

  it('emits nothing when editing with no changes', () => {
    const before: QosLimiterClass = {
      id: '1',
      burst: '15k',
      police: { exceed: 'drop', notExceed: 'ok' },
      matches: [],
      matchGroups: [],
      priority: 20,
    }
    const ops = limiterClassFormToOps('IN', '1', before, limiterClassToFormValues(before))
    expect(ops).toEqual([])
  })

  it('deleteLimiterClassOp deletes the class tagNode', () => {
    expect(deleteLimiterClassOp('IN', '1')).toEqual({ op: 'delete', path: ['qos', 'policy', 'limiter', 'IN', 'class', '1'] })
  })
})

describe('limiter default class form', () => {
  it('only emits ops for fields that changed', () => {
    const before: QosLimiterDefaultClass = { burst: '15k', police: { exceed: 'drop', notExceed: 'ok' } }
    const beforeValues = limiterDefaultClassToFormValues(before)
    const values = { ...beforeValues, bandwidth: '5mbit' }
    const ops = limiterDefaultClassFormToOps('IN', beforeValues, values)
    expect(ops).toEqual([
      { op: 'set', path: ['qos', 'policy', 'limiter', 'IN', 'default', 'bandwidth'], value: '5mbit' },
    ])
  })
})
