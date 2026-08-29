import { describe, expect, it } from 'vitest'
import {
  addAreaRangeOps,
  areaFormToOps,
  areaToFormValues,
  blankAreaFormValues,
  deleteAreaOp,
  removeAreaRangeOp,
} from './ospfAreaForm'
import type { OSPFArea } from './ospfTypes'

function emptyArea(overrides: Partial<OSPFArea> = {}): OSPFArea {
  return {
    id: '0',
    networks: [],
    noSummary: false,
    nssaDefaultInformationOriginate: false,
    ranges: [],
    ...overrides,
  }
}

describe('areaFormToOps - creating a new area', () => {
  it('queues nothing for a completely blank form', () => {
    expect(areaFormToOps('ospf', '0', undefined, blankAreaFormValues())).toEqual([])
  })

  it('sets a stub area with no-summary and default-cost', () => {
    const values = blankAreaFormValues()
    values.areaType = 'stub'
    values.noSummary = true
    values.defaultCost = '50'

    const ops = areaFormToOps('ospf', '1', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'area', '1', 'area-type', 'stub'] },
      { op: 'set', path: ['protocols', 'ospf', 'area', '1', 'area-type', 'stub', 'no-summary'] },
      {
        op: 'set',
        path: ['protocols', 'ospf', 'area', '1', 'area-type', 'stub', 'default-cost'],
        value: '50',
      },
    ])
  })

  it('sets an nssa area with translate role for ospf', () => {
    const values = blankAreaFormValues()
    values.areaType = 'nssa'
    values.nssaTranslate = 'always'

    const ops = areaFormToOps('ospf', '1', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'area', '1', 'area-type', 'nssa'] },
      { op: 'set', path: ['protocols', 'ospf', 'area', '1', 'area-type', 'nssa', 'translate'], value: 'always' },
    ])
  })

  it('sets an nssa area with default-information-originate for ospfv3, not translate', () => {
    const values = blankAreaFormValues()
    values.areaType = 'nssa'
    values.nssaDefaultInformationOriginate = true
    values.nssaTranslate = 'always' // should be ignored for ospfv3

    const ops = areaFormToOps('ospfv3', '1', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospfv3', 'area', '1', 'area-type', 'nssa'] },
      {
        op: 'set',
        path: ['protocols', 'ospfv3', 'area', '1', 'area-type', 'nssa', 'default-information-originate'],
      },
    ])
  })

  it('sets area authentication for ospf only', () => {
    const values = blankAreaFormValues()
    values.authentication = 'md5'

    expect(areaFormToOps('ospf', '0', undefined, values)).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'area', '0', 'authentication'], value: 'md5' },
    ])
    expect(areaFormToOps('ospfv3', '0', undefined, values)).toEqual([])
  })
})

describe('areaFormToOps - editing an existing area', () => {
  it('queues nothing when unchanged', () => {
    const area = emptyArea({ areaType: 'stub', noSummary: true, defaultCost: '10' })
    const ops = areaFormToOps('ospf', '0', area, areaToFormValues(area))
    expect(ops).toEqual([])
  })

  it('diffs a single field within the same area type', () => {
    const area = emptyArea({ areaType: 'stub', defaultCost: '10' })
    const values = areaToFormValues(area)
    values.defaultCost = '20'

    const ops = areaFormToOps('ospf', '0', area, values)

    expect(ops).toEqual([
      {
        op: 'set',
        path: ['protocols', 'ospf', 'area', '0', 'area-type', 'stub', 'default-cost'],
        value: '20',
      },
    ])
  })

  it('clears the whole area-type subtree and re-sets when switching from stub to nssa', () => {
    const area = emptyArea({ areaType: 'stub', noSummary: true })
    const values = areaToFormValues(area)
    values.areaType = 'nssa'
    values.noSummary = false
    values.nssaTranslate = 'candidate'

    const ops = areaFormToOps('ospf', '0', area, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'ospf', 'area', '0', 'area-type'] },
      { op: 'set', path: ['protocols', 'ospf', 'area', '0', 'area-type', 'nssa'] },
      {
        op: 'set',
        path: ['protocols', 'ospf', 'area', '0', 'area-type', 'nssa', 'translate'],
        value: 'candidate',
      },
    ])
  })

  it('clears area-type entirely when switching back to normal', () => {
    const area = emptyArea({ areaType: 'stub' })
    const values = areaToFormValues(area)
    values.areaType = ''

    const ops = areaFormToOps('ospf', '0', area, values)

    expect(ops).toEqual([{ op: 'delete', path: ['protocols', 'ospf', 'area', '0', 'area-type'] }])
  })

  it('queues a delete for a cleared default-cost', () => {
    const area = emptyArea({ areaType: 'stub', defaultCost: '10' })
    const values = areaToFormValues(area)
    values.defaultCost = ''

    const ops = areaFormToOps('ospf', '0', area, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'ospf', 'area', '0', 'area-type', 'stub', 'default-cost'] },
    ])
  })

  it('queues a flag delete when no-summary is unchecked', () => {
    const area = emptyArea({ areaType: 'nssa', noSummary: true })
    const values = areaToFormValues(area)
    values.noSummary = false

    const ops = areaFormToOps('ospf', '0', area, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'ospf', 'area', '0', 'area-type', 'nssa', 'no-summary'] },
    ])
  })
})

describe('deleteAreaOp', () => {
  it('builds a delete op for the whole area', () => {
    expect(deleteAreaOp('ospf', '0')).toEqual({ op: 'delete', path: ['protocols', 'ospf', 'area', '0'] })
  })
})

describe('area range ops', () => {
  it('builds a bare set op with no options', () => {
    expect(addAreaRangeOps('ospf', '0', '192.0.2.0/24', {})).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'area', '0', 'range', '192.0.2.0/24'] },
    ])
  })

  it('includes not-advertise, cost, and substitute for ospf', () => {
    const ops = addAreaRangeOps('ospf', '0', '192.0.2.0/24', {
      notAdvertise: true,
      cost: '10',
      substitute: '198.51.100.0/24',
    })
    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'area', '0', 'range', '192.0.2.0/24'] },
      { op: 'set', path: ['protocols', 'ospf', 'area', '0', 'range', '192.0.2.0/24', 'not-advertise'] },
      {
        op: 'set',
        path: ['protocols', 'ospf', 'area', '0', 'range', '192.0.2.0/24', 'cost'],
        value: '10',
      },
      {
        op: 'set',
        path: ['protocols', 'ospf', 'area', '0', 'range', '192.0.2.0/24', 'substitute'],
        value: '198.51.100.0/24',
      },
    ])
  })

  it('ignores cost/substitute for ospfv3', () => {
    const ops = addAreaRangeOps('ospfv3', '0', '2001:db8::/32', {
      notAdvertise: true,
      cost: '10',
      substitute: '2001:db8:1::/32',
    })
    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospfv3', 'area', '0', 'range', '2001:db8::/32'] },
      { op: 'set', path: ['protocols', 'ospfv3', 'area', '0', 'range', '2001:db8::/32', 'not-advertise'] },
    ])
  })

  it('builds a delete op for removing a range', () => {
    expect(removeAreaRangeOp('ospf', '0', '192.0.2.0/24')).toEqual({
      op: 'delete',
      path: ['protocols', 'ospf', 'area', '0', 'range', '192.0.2.0/24'],
    })
  })
})
