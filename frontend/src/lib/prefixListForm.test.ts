import { describe, expect, it } from 'vitest'
import {
  blankPrefixListFormValues,
  blankPrefixListRuleFormValues,
  deletePrefixListOp,
  deletePrefixListRuleOp,
  prefixListFormToOps,
  prefixListRuleFormToOps,
  prefixListRuleToFormValues,
  prefixListToFormValues,
} from './prefixListForm'
import type { PrefixList, PrefixListRule } from './policyTypes'

function emptyList(overrides: Partial<PrefixList> = {}): PrefixList {
  return { family: 'ipv4', name: 'PL4', rules: [], ...overrides }
}

function emptyRule(overrides: Partial<PrefixListRule> = {}): PrefixListRule {
  return { number: '10', ...overrides }
}

describe('prefixListFormToOps', () => {
  it('queues nothing for a blank form', () => {
    expect(prefixListFormToOps('ipv4', 'PL4', undefined, blankPrefixListFormValues())).toEqual([])
  })

  it('uses the correct node name per family', () => {
    const values = blankPrefixListFormValues()
    values.description = 'x'
    expect(prefixListFormToOps('ipv6', 'PL6', undefined, values)).toEqual([
      { op: 'set', path: ['policy', 'prefix-list6', 'PL6', 'description'], value: 'x' },
    ])
  })

  it('queues nothing when unchanged', () => {
    const list = emptyList({ description: 'x' })
    expect(prefixListFormToOps('ipv4', 'PL4', list, prefixListToFormValues(list))).toEqual([])
  })
})

describe('deletePrefixListOp', () => {
  it('builds a delete op', () => {
    expect(deletePrefixListOp('ipv6', 'PL6')).toEqual({ op: 'delete', path: ['policy', 'prefix-list6', 'PL6'] })
  })
})

describe('prefixListRuleFormToOps', () => {
  it('queues nothing for a blank form', () => {
    expect(prefixListRuleFormToOps('ipv4', 'PL4', '10', undefined, blankPrefixListRuleFormValues())).toEqual([])
  })

  it('queues action/prefix/le on creation', () => {
    const values = blankPrefixListRuleFormValues()
    values.action = 'permit'
    values.prefix = '192.0.2.0/24'
    values.le = '32'

    const ops = prefixListRuleFormToOps('ipv4', 'PL4', '10', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['policy', 'prefix-list', 'PL4', 'rule', '10', 'action'], value: 'permit' },
      { op: 'set', path: ['policy', 'prefix-list', 'PL4', 'rule', '10', 'prefix'], value: '192.0.2.0/24' },
      { op: 'set', path: ['policy', 'prefix-list', 'PL4', 'rule', '10', 'le'], value: '32' },
    ])
  })

  it('diffs a single field on edit', () => {
    const rule = emptyRule({ prefix: '192.0.2.0/24' })
    const values = prefixListRuleToFormValues(rule)
    values.prefix = '198.51.100.0/24'

    expect(prefixListRuleFormToOps('ipv4', 'PL4', '10', rule, values)).toEqual([
      {
        op: 'set',
        path: ['policy', 'prefix-list', 'PL4', 'rule', '10', 'prefix'],
        value: '198.51.100.0/24',
      },
    ])
  })

  it('queues a delete when ge is cleared', () => {
    const rule = emptyRule({ ge: '24' })
    const values = prefixListRuleToFormValues(rule)
    values.ge = ''

    expect(prefixListRuleFormToOps('ipv6', 'PL6', '10', rule, values)).toEqual([
      { op: 'delete', path: ['policy', 'prefix-list6', 'PL6', 'rule', '10', 'ge'] },
    ])
  })
})

describe('deletePrefixListRuleOp', () => {
  it('builds a delete op for a single rule', () => {
    expect(deletePrefixListRuleOp('ipv4', 'PL4', '10')).toEqual({
      op: 'delete',
      path: ['policy', 'prefix-list', 'PL4', 'rule', '10'],
    })
  })
})
