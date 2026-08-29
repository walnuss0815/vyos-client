import { describe, expect, it } from 'vitest'
import {
  blankMdnsRepeaterFormValues,
  disableMdnsRepeaterOp,
  enableMdnsRepeaterOp,
  mdnsConfigToFormValues,
  mdnsRepeaterFormToOps,
} from './serviceMdnsForm'
import { blankMdnsRepeaterConfig } from './serviceMdnsTypes'

describe('mdnsRepeaterFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(mdnsRepeaterFormToOps(blankMdnsRepeaterConfig(), blankMdnsRepeaterFormValues())).toEqual([])
  })

  it('queues flag and scalar fields', () => {
    const values = blankMdnsRepeaterFormValues()
    values.disabled = true
    values.ipVersion = 'ipv4'

    expect(mdnsRepeaterFormToOps(blankMdnsRepeaterConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'mdns', 'repeater', 'disable'] },
      { op: 'set', path: ['service', 'mdns', 'repeater', 'ip-version'], value: 'ipv4' },
    ])
  })

  it('queues a delete when cleared', () => {
    const before = { ...blankMdnsRepeaterConfig(), ipVersion: 'ipv4' }
    const values = mdnsConfigToFormValues(before)
    values.ipVersion = ''

    expect(mdnsRepeaterFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'mdns', 'repeater', 'ip-version'] },
    ])
  })
})

describe('enableMdnsRepeaterOp / disableMdnsRepeaterOp', () => {
  it('builds the expected ops', () => {
    expect(enableMdnsRepeaterOp()).toEqual({ op: 'set', path: ['service', 'mdns', 'repeater'] })
    expect(disableMdnsRepeaterOp()).toEqual({ op: 'delete', path: ['service', 'mdns', 'repeater'] })
  })
})
