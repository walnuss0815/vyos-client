import { describe, expect, it } from 'vitest'
import {
  addStaticHostMappingOps,
  blankGeneralFormValues,
  deleteStaticHostMappingOp,
  generalFormToOps,
  generalToFormValues,
} from './systemGeneralForm'
import { blankGeneralSettings } from './systemTypes'

describe('generalToFormValues / generalFormToOps', () => {
  it('normalizes undefined fields to blank', () => {
    expect(generalToFormValues(blankGeneralSettings())).toEqual(blankGeneralFormValues())
  })

  it('queues nothing when unchanged', () => {
    const settings = { ...blankGeneralSettings(), hostName: 'router1' }
    expect(generalFormToOps(settings, generalToFormValues(settings))).toEqual([])
  })

  it('queues a set for a changed host-name', () => {
    const settings = blankGeneralSettings()
    const values = generalToFormValues(settings)
    values.hostName = 'router1'

    expect(generalFormToOps(settings, values)).toEqual([
      { op: 'set', path: ['system', 'host-name'], value: 'router1' },
    ])
  })

  it('queues a delete for a cleared time-zone', () => {
    const settings = { ...blankGeneralSettings(), timeZone: 'UTC' }
    const values = generalToFormValues(settings)
    values.timeZone = ''

    expect(generalFormToOps(settings, values)).toEqual([
      { op: 'delete', path: ['system', 'time-zone'] },
    ])
  })
})

describe('static host mapping ops', () => {
  it('queues address and alias when creating', () => {
    const ops = addStaticHostMappingOps('fileserver', '10.0.0.5', 'files')
    expect(ops).toEqual([
      {
        op: 'set',
        path: ['system', 'static-host-mapping', 'host-name', 'fileserver', 'inet'],
        value: '10.0.0.5',
      },
      {
        op: 'set',
        path: ['system', 'static-host-mapping', 'host-name', 'fileserver', 'alias'],
        value: 'files',
      },
    ])
  })

  it('omits the alias op when blank', () => {
    const ops = addStaticHostMappingOps('fileserver', '10.0.0.5', '')
    expect(ops).toEqual([
      {
        op: 'set',
        path: ['system', 'static-host-mapping', 'host-name', 'fileserver', 'inet'],
        value: '10.0.0.5',
      },
    ])
  })

  it('builds a delete op for the whole mapping', () => {
    expect(deleteStaticHostMappingOp('fileserver')).toEqual({
      op: 'delete',
      path: ['system', 'static-host-mapping', 'host-name', 'fileserver'],
    })
  })
})
