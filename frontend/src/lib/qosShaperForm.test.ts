import { describe, expect, it } from 'vitest'
import {
  blankShaperClassFormValues,
  blankShaperPolicyFormValues,
  deleteShaperClassOp,
  deleteShaperPolicyOp,
  shaperClassFormToOps,
  shaperClassToFormValues,
  shaperDefaultClassFormToOps,
  shaperDefaultClassToFormValues,
  shaperPolicyFormToOps,
} from './qosShaperForm'
import type { QosShaperClass, QosShaperDefaultClass } from './qosTypes'

describe('shaper policy form', () => {
  it('creates a new policy with just the bare set when left at defaults', () => {
    const ops = shaperPolicyFormToOps('WAN-OUT', undefined, blankShaperPolicyFormValues())
    expect(ops).toEqual([{ op: 'set', path: ['qos', 'policy', 'shaper', 'WAN-OUT'] }])
  })

  it('sets an explicit bandwidth when it differs from the default', () => {
    const values = { ...blankShaperPolicyFormValues(), bandwidth: '100mbit' }
    const ops = shaperPolicyFormToOps('WAN-OUT', undefined, values)
    expect(ops).toEqual([
      { op: 'set', path: ['qos', 'policy', 'shaper', 'WAN-OUT'] },
      { op: 'set', path: ['qos', 'policy', 'shaper', 'WAN-OUT', 'bandwidth'], value: '100mbit' },
    ])
  })

  it('deleteShaperPolicyOp deletes the whole policy tagNode', () => {
    expect(deleteShaperPolicyOp('WAN-OUT')).toEqual({ op: 'delete', path: ['qos', 'policy', 'shaper', 'WAN-OUT'] })
  })
})

describe('shaper class form', () => {
  it('creates a new class with ceiling/queue-type/set-dscp', () => {
    const values = { ...blankShaperClassFormValues(), bandwidth: '50mbit', ceiling: '80mbit', setDscp: 'AF41' }
    const ops = shaperClassFormToOps('WAN-OUT', '2', undefined, values)
    expect(ops[0]).toEqual({ op: 'set', path: ['qos', 'policy', 'shaper', 'WAN-OUT', 'class', '2'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'shaper', 'WAN-OUT', 'class', '2', 'ceiling'],
      value: '80mbit',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'shaper', 'WAN-OUT', 'class', '2', 'set-dscp'],
      value: 'AF41',
    })
  })

  it('emits nothing when editing with no changes', () => {
    const before: QosShaperClass = { id: '2', burst: '15k', queueType: 'fq-codel', matches: [], matchGroups: [] }
    const ops = shaperClassFormToOps('WAN-OUT', '2', before, shaperClassToFormValues(before))
    expect(ops).toEqual([])
  })

  it('deleteShaperClassOp deletes the class tagNode', () => {
    expect(deleteShaperClassOp('WAN-OUT', '2')).toEqual({
      op: 'delete',
      path: ['qos', 'policy', 'shaper', 'WAN-OUT', 'class', '2'],
    })
  })
})

describe('shaper default class form', () => {
  it('only emits ops for fields that changed', () => {
    const before: QosShaperDefaultClass = { burst: '15k', priority: 20, queueType: 'fq-codel' }
    const beforeValues = shaperDefaultClassToFormValues(before)
    const values = { ...beforeValues, bandwidth: '10mbit' }
    const ops = shaperDefaultClassFormToOps('WAN-OUT', beforeValues, values)
    expect(ops).toEqual([
      { op: 'set', path: ['qos', 'policy', 'shaper', 'WAN-OUT', 'default', 'bandwidth'], value: '10mbit' },
    ])
  })
})
