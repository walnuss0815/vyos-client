import { describe, expect, it } from 'vitest'
import {
  addQosMatchGroupRefOp,
  addQosMatchOps,
  blankQosMatchOptions,
  removeQosMatchGroupRefOp,
  removeQosMatchOp,
} from './qosMatchForm'

const BASE = ['qos', 'policy', 'shaper', 'WAN-OUT', 'class', '2']

describe('addQosMatchOps', () => {
  it('sets only the fields that were provided', () => {
    const options = { ...blankQosMatchOptions(), ipDestinationPort: '443', ipProtocol: 'tcp' }
    const ops = addQosMatchOps(BASE, 'web', options)
    expect(ops).toEqual([
      { op: 'set', path: [...BASE, 'match', 'web'] },
      { op: 'set', path: [...BASE, 'match', 'web', 'ip', 'destination', 'port'], value: '443' },
      { op: 'set', path: [...BASE, 'match', 'web', 'ip', 'protocol'], value: 'tcp' },
    ])
  })

  it('sets mark/vif/interface fields when provided', () => {
    const options = { ...blankQosMatchOptions(), mark: '5', vif: '10', interfaceName: 'eth1' }
    const ops = addQosMatchOps(BASE, 'tagged', options)
    expect(ops).toEqual([
      { op: 'set', path: [...BASE, 'match', 'tagged'] },
      { op: 'set', path: [...BASE, 'match', 'tagged', 'interface'], value: 'eth1' },
      { op: 'set', path: [...BASE, 'match', 'tagged', 'mark'], value: '5' },
      { op: 'set', path: [...BASE, 'match', 'tagged', 'vif'], value: '10' },
    ])
  })

  it('emits just a bare set when nothing else was provided', () => {
    const ops = addQosMatchOps(BASE, 'empty', blankQosMatchOptions())
    expect(ops).toEqual([{ op: 'set', path: [...BASE, 'match', 'empty'] }])
  })
})

describe('removeQosMatchOp', () => {
  it('deletes the match tagNode', () => {
    expect(removeQosMatchOp(BASE, 'web')).toEqual({ op: 'delete', path: [...BASE, 'match', 'web'] })
  })
})

describe('match-group references', () => {
  it('add/remove target the match-group leaf with a value', () => {
    expect(addQosMatchGroupRefOp(BASE, 'WEB')).toEqual({ op: 'set', path: [...BASE, 'match-group'], value: 'WEB' })
    expect(removeQosMatchGroupRefOp(BASE, 'WEB')).toEqual({ op: 'delete', path: [...BASE, 'match-group'], value: 'WEB' })
  })
})
