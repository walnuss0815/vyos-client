import { describe, expect, it } from 'vitest'
import {
  blankCakeFormValues,
  blankFqCodelFormValues,
  blankRateControlFormValues,
  cakeFormToOps,
  deleteCakePolicyOp,
  deleteFqCodelPolicyOp,
  deleteRateControlPolicyOp,
  fqCodelFormToOps,
  rateControlFormToOps,
} from './qosSimplePolicyForm'

describe('cake form', () => {
  it('creates a new policy with a flag and a scalar field', () => {
    const values = { ...blankCakeFormValues(), bandwidth: '1gbit', ackFilterAggressive: true }
    const ops = cakeFormToOps('C', undefined, values)
    expect(ops[0]).toEqual({ op: 'set', path: ['qos', 'policy', 'cake', 'C'] })
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'cake', 'C', 'bandwidth'], value: '1gbit' })
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'cake', 'C', 'ack-filter', 'aggressive'] })
  })

  it('deleteCakePolicyOp deletes the whole policy tagNode', () => {
    expect(deleteCakePolicyOp('C')).toEqual({ op: 'delete', path: ['qos', 'policy', 'cake', 'C'] })
  })
})

describe('fq-codel form', () => {
  it('creates a new policy with numeric fields', () => {
    const values = { ...blankFqCodelFormValues(), target: '5', queueLimit: '10240' }
    const ops = fqCodelFormToOps('F', undefined, values)
    expect(ops[0]).toEqual({ op: 'set', path: ['qos', 'policy', 'fq-codel', 'F'] })
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'fq-codel', 'F', 'target'], value: '5' })
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'fq-codel', 'F', 'queue-limit'], value: '10240' })
  })

  it('deleteFqCodelPolicyOp deletes the whole policy tagNode', () => {
    expect(deleteFqCodelPolicyOp('F')).toEqual({ op: 'delete', path: ['qos', 'policy', 'fq-codel', 'F'] })
  })
})

describe('rate-control form', () => {
  it('creates a new policy with just the bare set when left at defaults', () => {
    const ops = rateControlFormToOps('RC', undefined, blankRateControlFormValues())
    expect(ops).toEqual([{ op: 'set', path: ['qos', 'policy', 'rate-control', 'RC'] }])
  })

  it('sets an explicit bandwidth when provided', () => {
    const values = { ...blankRateControlFormValues(), bandwidth: '10mbit' }
    const ops = rateControlFormToOps('RC', undefined, values)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'rate-control', 'RC', 'bandwidth'],
      value: '10mbit',
    })
  })

  it('deleteRateControlPolicyOp deletes the whole policy tagNode', () => {
    expect(deleteRateControlPolicyOp('RC')).toEqual({ op: 'delete', path: ['qos', 'policy', 'rate-control', 'RC'] })
  })
})
