import { describe, expect, it } from 'vitest'
import {
  blankStaticFormValues,
  deleteStaticRuleOp,
  staticFormToOps,
  staticToFormValues,
} from './natStaticForm'
import type { NATStaticRule } from './natTypes'

function emptyStaticRule(overrides: Partial<NATStaticRule> = {}): NATStaticRule {
  return { number: '2000', log: false, ...overrides }
}

describe('staticFormToOps - creating a new rule', () => {
  it('queues nothing for a blank form', () => {
    expect(staticFormToOps('2000', undefined, blankStaticFormValues())).toEqual([])
  })

  it('queues a full 1-to-1 mapping', () => {
    const values = blankStaticFormValues()
    values.description = '1-to-1 NAT example'
    values.destinationAddress = '192.0.2.30'
    values.interfaceName = 'eth1'
    values.translationAddress = '192.168.1.10'
    values.log = true

    const ops = staticFormToOps('2000', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['nat', 'static', 'rule', '2000', 'description'], value: '1-to-1 NAT example' },
      { op: 'set', path: ['nat', 'static', 'rule', '2000', 'destination', 'address'], value: '192.0.2.30' },
      { op: 'set', path: ['nat', 'static', 'rule', '2000', 'inbound-interface'], value: 'eth1' },
      { op: 'set', path: ['nat', 'static', 'rule', '2000', 'translation', 'address'], value: '192.168.1.10' },
      { op: 'set', path: ['nat', 'static', 'rule', '2000', 'log'] },
    ])
  })
})

describe('staticFormToOps - editing an existing rule', () => {
  it('queues nothing when unchanged', () => {
    const rule = emptyStaticRule({ translationAddress: '192.168.1.10' })
    expect(staticFormToOps('2000', rule, staticToFormValues(rule))).toEqual([])
  })

  it('diffs a single field', () => {
    const rule = emptyStaticRule({ translationAddress: '192.168.1.10' })
    const values = staticToFormValues(rule)
    values.translationAddress = '192.168.1.20'

    expect(staticFormToOps('2000', rule, values)).toEqual([
      { op: 'set', path: ['nat', 'static', 'rule', '2000', 'translation', 'address'], value: '192.168.1.20' },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const rule = emptyStaticRule({ description: 'old' })
    const values = staticToFormValues(rule)
    values.description = ''

    expect(staticFormToOps('2000', rule, values)).toEqual([
      { op: 'delete', path: ['nat', 'static', 'rule', '2000', 'description'] },
    ])
  })

  it('queues a flag delete when log is unchecked', () => {
    const rule = emptyStaticRule({ log: true })
    const values = staticToFormValues(rule)
    values.log = false

    expect(staticFormToOps('2000', rule, values)).toEqual([
      { op: 'delete', path: ['nat', 'static', 'rule', '2000', 'log'] },
    ])
  })
})

describe('deleteStaticRuleOp', () => {
  it('builds a delete op for the whole rule', () => {
    expect(deleteStaticRuleOp('2000')).toEqual({ op: 'delete', path: ['nat', 'static', 'rule', '2000'] })
  })
})
