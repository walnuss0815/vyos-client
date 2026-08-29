import { describe, expect, it } from 'vitest'
import { deleteMatchGroupOp, matchGroupFormToOps } from './qosMatchGroupForm'
import type { QosMatchGroup } from './qosTypes'

describe('matchGroupFormToOps', () => {
  it('creates a new match group with a description', () => {
    const ops = matchGroupFormToOps('WEB', undefined, { description: 'web traffic' })
    expect(ops).toEqual([
      { op: 'set', path: ['qos', 'traffic-match-group', 'WEB'] },
      { op: 'set', path: ['qos', 'traffic-match-group', 'WEB', 'description'], value: 'web traffic' },
    ])
  })

  it('emits nothing when editing with no changes', () => {
    const before: QosMatchGroup = { name: 'WEB', description: 'web traffic', matches: [] }
    const ops = matchGroupFormToOps('WEB', before, { description: 'web traffic' })
    expect(ops).toEqual([])
  })
})

describe('deleteMatchGroupOp', () => {
  it('deletes the whole match-group tagNode', () => {
    expect(deleteMatchGroupOp('WEB')).toEqual({ op: 'delete', path: ['qos', 'traffic-match-group', 'WEB'] })
  })
})
