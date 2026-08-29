import { describe, expect, it } from 'vitest'
import {
  addNTPServerOps,
  blankNTPGeneralFormValues,
  blankNTPServerFlags,
  ntpConfigToGeneralFormValues,
  ntpGeneralFormToOps,
  removeNTPServerOp,
} from './serviceNtpForm'
import { blankNTPConfig } from './serviceNtpTypes'

describe('ntpGeneralFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(ntpGeneralFormToOps(blankNTPConfig(), blankNTPGeneralFormValues())).toEqual([])
  })

  it('queues set ops for changed scalar fields', () => {
    const values = blankNTPGeneralFormValues()
    values.vrf = 'RED'
    values.leapSecond = 'smear'
    values.localStratum = '5'

    expect(ntpGeneralFormToOps(blankNTPConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'ntp', 'vrf'], value: 'RED' },
      { op: 'set', path: ['service', 'ntp', 'leap-second'], value: 'smear' },
      { op: 'set', path: ['service', 'ntp', 'local-stratum'], value: '5' },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const before = { ...blankNTPConfig(), vrf: 'RED' }
    const values = ntpConfigToGeneralFormValues(before)
    values.vrf = ''

    expect(ntpGeneralFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'ntp', 'vrf'] },
    ])
  })
})

describe('addNTPServerOps', () => {
  it('always sets the server tag itself, even with no flags', () => {
    expect(addNTPServerOps('192.0.2.1', blankNTPServerFlags())).toEqual([
      { op: 'set', path: ['service', 'ntp', 'server', '192.0.2.1'] },
    ])
  })

  it('queues one set op per enabled flag', () => {
    const flags = { ...blankNTPServerFlags(), prefer: true, nts: true }
    const ops = addNTPServerOps('192.0.2.1', flags)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['service', 'ntp', 'server', '192.0.2.1'] },
        { op: 'set', path: ['service', 'ntp', 'server', '192.0.2.1', 'prefer'] },
        { op: 'set', path: ['service', 'ntp', 'server', '192.0.2.1', 'nts'] },
      ]),
    )
    expect(ops).toHaveLength(3)
  })
})

describe('removeNTPServerOp', () => {
  it('builds a delete op for the whole server entry', () => {
    expect(removeNTPServerOp('192.0.2.1')).toEqual({
      op: 'delete',
      path: ['service', 'ntp', 'server', '192.0.2.1'],
    })
  })
})
