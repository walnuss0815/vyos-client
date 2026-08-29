import { describe, expect, it } from 'vitest'
import {
  blankLLDPGeneralFormValues,
  blankLLDPInterfaceFormValues,
  deleteLLDPInterfaceOp,
  disableLLDPOp,
  enableLLDPOp,
  lldpGeneralFormToOps,
  lldpInterfaceFormToOps,
  lldpInterfaceToFormValues,
} from './serviceLldpForm'
import { blankLLDPInterface, type LLDPInterface } from './serviceLldpTypes'

function emptyInterface(overrides: Partial<LLDPInterface> = {}): LLDPInterface {
  return { interfaceName: 'eth0', ...blankLLDPInterface(), ...overrides }
}

describe('lldpInterfaceFormToOps - creating', () => {
  it('always sets the interface tag itself, even with a blank form', () => {
    expect(lldpInterfaceFormToOps('eth0', undefined, blankLLDPInterfaceFormValues())).toEqual([
      { op: 'set', path: ['service', 'lldp', 'interface', 'eth0'] },
    ])
  })

  it('queues mode, coordinate fields, and elin', () => {
    const values = blankLLDPInterfaceFormValues()
    values.mode = 'rx'
    values.altitude = '10'
    values.elin = '911'

    const ops = lldpInterfaceFormToOps('eth0', undefined, values)
    expect(ops).toEqual([
      { op: 'set', path: ['service', 'lldp', 'interface', 'eth0'] },
      { op: 'set', path: ['service', 'lldp', 'interface', 'eth0', 'mode'], value: 'rx' },
      {
        op: 'set',
        path: ['service', 'lldp', 'interface', 'eth0', 'location', 'coordinate-based', 'altitude'],
        value: '10',
      },
      { op: 'set', path: ['service', 'lldp', 'interface', 'eth0', 'location', 'elin'], value: '911' },
    ])
  })
})

describe('lldpInterfaceFormToOps - editing', () => {
  it('queues nothing when unchanged (no base set re-issued)', () => {
    const iface = emptyInterface({ mode: 'rx' })
    expect(lldpInterfaceFormToOps('eth0', iface, lldpInterfaceToFormValues(iface))).toEqual([])
  })
})

describe('deleteLLDPInterfaceOp', () => {
  it('builds a delete op', () => {
    expect(deleteLLDPInterfaceOp('eth0')).toEqual({
      op: 'delete',
      path: ['service', 'lldp', 'interface', 'eth0'],
    })
  })
})

describe('lldpGeneralFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(lldpGeneralFormToOps(blankLLDPGeneralFormValues(), blankLLDPGeneralFormValues())).toEqual([])
  })

  it('queues legacy protocol and snmp flags', () => {
    const values = blankLLDPGeneralFormValues()
    values.legacyCdp = true
    values.snmp = true

    expect(lldpGeneralFormToOps(blankLLDPGeneralFormValues(), values)).toEqual([
      { op: 'set', path: ['service', 'lldp', 'legacy-protocols', 'cdp'] },
      { op: 'set', path: ['service', 'lldp', 'snmp'] },
    ])
  })
})

describe('enableLLDPOp / disableLLDPOp', () => {
  it('builds the expected ops', () => {
    expect(enableLLDPOp()).toEqual({ op: 'set', path: ['service', 'lldp'] })
    expect(disableLLDPOp()).toEqual({ op: 'delete', path: ['service', 'lldp'] })
  })
})
