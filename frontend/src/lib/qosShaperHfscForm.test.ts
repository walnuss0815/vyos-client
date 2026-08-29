import { describe, expect, it } from 'vitest'
import {
  blankHfscClassFormValues,
  blankShaperHfscPolicyFormValues,
  deleteHfscClassOp,
  deleteShaperHfscPolicyOp,
  hfscClassFormToOps,
  hfscClassToFormValues,
  hfscDefaultClassFormToOps,
  hfscDefaultClassToFormValues,
  shaperHfscPolicyFormToOps,
} from './qosShaperHfscForm'
import type { QosHfscClass, QosHfscDefaultClass } from './qosTypes'

describe('shaper-hfsc policy form', () => {
  it('creates a new policy with just the bare set when left at defaults', () => {
    const ops = shaperHfscPolicyFormToOps('W', undefined, blankShaperHfscPolicyFormValues())
    expect(ops).toEqual([{ op: 'set', path: ['qos', 'policy', 'shaper-hfsc', 'W'] }])
  })

  it('deleteShaperHfscPolicyOp deletes the whole policy tagNode', () => {
    expect(deleteShaperHfscPolicyOp('W')).toEqual({ op: 'delete', path: ['qos', 'policy', 'shaper-hfsc', 'W'] })
  })
})

describe('shaper-hfsc class form', () => {
  it('creates a new class with a linkshare curve', () => {
    const values = blankHfscClassFormValues()
    values.linkshare = { d: '10', m1: '10mbit', m2: '5mbit' }
    const ops = hfscClassFormToOps('W', '1', undefined, values)
    expect(ops[0]).toEqual({ op: 'set', path: ['qos', 'policy', 'shaper-hfsc', 'W', 'class', '1'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'shaper-hfsc', 'W', 'class', '1', 'linkshare', 'm1'],
      value: '10mbit',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'shaper-hfsc', 'W', 'class', '1', 'linkshare', 'm2'],
      value: '5mbit',
    })
  })

  it('emits nothing when editing with no changes', () => {
    const before: QosHfscClass = {
      id: '1',
      linkshare: { m2: '5mbit' },
      realtime: {},
      upperlimit: {},
      matches: [],
      matchGroups: [],
    }
    const ops = hfscClassFormToOps('W', '1', before, hfscClassToFormValues(before))
    expect(ops).toEqual([])
  })

  it('deleteHfscClassOp deletes the class tagNode', () => {
    expect(deleteHfscClassOp('W', '1')).toEqual({ op: 'delete', path: ['qos', 'policy', 'shaper-hfsc', 'W', 'class', '1'] })
  })
})

describe('shaper-hfsc default class form', () => {
  it('only emits ops for curve fields that changed', () => {
    const before: QosHfscDefaultClass = { linkshare: { m2: '5mbit' }, realtime: {}, upperlimit: {} }
    const beforeValues = hfscDefaultClassToFormValues(before)
    const values = { ...beforeValues, upperlimit: { d: '', m1: '', m2: '10mbit' } }
    const ops = hfscDefaultClassFormToOps('W', beforeValues, values)
    expect(ops).toEqual([
      { op: 'set', path: ['qos', 'policy', 'shaper-hfsc', 'W', 'default', 'upperlimit', 'm2'], value: '10mbit' },
    ])
  })
})
