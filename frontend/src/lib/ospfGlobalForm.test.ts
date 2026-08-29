import { describe, expect, it } from 'vitest'
import {
  addRedistributionOps,
  blankGlobalFormValues,
  globalFormToOps,
  globalToFormValues,
  removeRedistributionOp,
} from './ospfGlobalForm'
import { blankGlobalSettings } from './ospfTypes'

describe('globalToFormValues / globalFormToOps', () => {
  it('normalizes undefined fields to blank/false', () => {
    expect(globalToFormValues(blankGlobalSettings())).toEqual(blankGlobalFormValues())
  })

  it('queues nothing when unchanged', () => {
    const settings = { ...blankGlobalSettings(), routerId: '192.0.2.1' }
    const ops = globalFormToOps('ospf', settings, globalToFormValues(settings))
    expect(ops).toEqual([])
  })

  it('queues a set for a changed router-id', () => {
    const settings = blankGlobalSettings()
    const values = globalToFormValues(settings)
    values.routerId = '192.0.2.1'

    const ops = globalFormToOps('ospf', settings, values)

    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'parameters', 'router-id'], value: '192.0.2.1' },
    ])
  })

  it('queues a delete for a cleared auto-cost reference-bandwidth', () => {
    const settings = { ...blankGlobalSettings(), autoCostReferenceBandwidth: '1000' }
    const values = globalToFormValues(settings)
    values.autoCostReferenceBandwidth = ''

    const ops = globalFormToOps('ospf', settings, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'ospf', 'auto-cost', 'reference-bandwidth'] },
    ])
  })

  it('uses the protocol name itself as the node under distance', () => {
    const settings = blankGlobalSettings()
    const values = globalToFormValues(settings)
    values.distanceExternal = '110'

    expect(globalFormToOps('ospf', settings, values)).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'distance', 'ospf', 'external'], value: '110' },
    ])
    expect(globalFormToOps('ospfv3', settings, values)).toEqual([
      { op: 'set', path: ['protocols', 'ospfv3', 'distance', 'ospfv3', 'external'], value: '110' },
    ])
  })

  it('queues a flag set/delete for default-information-originate always', () => {
    const settings = blankGlobalSettings()
    const values = globalToFormValues(settings)
    values.defaultInformationOriginateAlways = true

    expect(globalFormToOps('ospf', settings, values)).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'default-information', 'originate', 'always'] },
    ])
  })

  it('queues default-metric only for ospf, never ospfv3', () => {
    const settings = blankGlobalSettings()
    const values = globalToFormValues(settings)
    values.defaultMetric = '20'

    expect(globalFormToOps('ospf', settings, values)).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'default-metric'], value: '20' },
    ])
    expect(globalFormToOps('ospfv3', settings, values)).toEqual([])
  })
})

describe('redistribution ops', () => {
  it('builds a bare set op with no metric/metric-type', () => {
    expect(addRedistributionOps('ospf', 'static', '', '')).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'redistribute', 'static'] },
    ])
  })

  it('includes metric and metric-type when given', () => {
    const ops = addRedistributionOps('ospf', 'static', '20', '1')
    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'redistribute', 'static'] },
      { op: 'set', path: ['protocols', 'ospf', 'redistribute', 'static', 'metric'], value: '20' },
      { op: 'set', path: ['protocols', 'ospf', 'redistribute', 'static', 'metric-type'], value: '1' },
    ])
  })

  it('builds a delete op for removing a redistribution source', () => {
    expect(removeRedistributionOp('ospfv3', 'connected')).toEqual({
      op: 'delete',
      path: ['protocols', 'ospfv3', 'redistribute', 'connected'],
    })
  })
})
