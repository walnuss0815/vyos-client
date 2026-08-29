import { describe, expect, it } from 'vitest'
import { deleteQosInterfaceBindingOp, setQosInterfaceDirectionOp } from './qosInterfaceForm'

describe('setQosInterfaceDirectionOp', () => {
  it('sets a trimmed policy name for a direction', () => {
    expect(setQosInterfaceDirectionOp('eth0', 'egress', ' WAN-OUT ')).toEqual({
      op: 'set',
      path: ['qos', 'interface', 'eth0', 'egress'],
      value: 'WAN-OUT',
    })
  })

  it('deletes the direction leaf when cleared to blank', () => {
    expect(setQosInterfaceDirectionOp('eth0', 'ingress', '')).toEqual({
      op: 'delete',
      path: ['qos', 'interface', 'eth0', 'ingress'],
    })
  })
})

describe('deleteQosInterfaceBindingOp', () => {
  it('deletes the whole interface tagNode', () => {
    expect(deleteQosInterfaceBindingOp('eth0')).toEqual({ op: 'delete', path: ['qos', 'interface', 'eth0'] })
  })
})
