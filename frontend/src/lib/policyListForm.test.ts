import { describe, expect, it } from 'vitest'
import {
  blankPolicyListFormValues,
  blankPolicyListRuleFormValues,
  deletePolicyListOp,
  deletePolicyListRuleOp,
  policyListFormToOps,
  policyListRuleFormToOps,
  policyListRuleToFormValues,
  policyListToFormValues,
} from './policyListForm'
import type { PolicyList, PolicyListRule } from './policyTypes'

function emptyList(overrides: Partial<PolicyList> = {}): PolicyList {
  return { kind: 'as-path', name: 'ASPL', rules: [], ...overrides }
}

function emptyRule(overrides: Partial<PolicyListRule> = {}): PolicyListRule {
  return { number: '10', ...overrides }
}

describe('policyListFormToOps', () => {
  it('queues nothing for a blank form', () => {
    expect(policyListFormToOps('as-path', 'ASPL', undefined, blankPolicyListFormValues())).toEqual([])
  })

  it('queues a description set', () => {
    const values = blankPolicyListFormValues()
    values.description = 'Upstream AS filter'
    expect(policyListFormToOps('as-path', 'ASPL', undefined, values)).toEqual([
      { op: 'set', path: ['policy', 'as-path-list', 'ASPL', 'description'], value: 'Upstream AS filter' },
    ])
  })

  it('uses the correct node name per kind', () => {
    const values = blankPolicyListFormValues()
    values.description = 'x'
    expect(policyListFormToOps('large-community', 'LCL', undefined, values)).toEqual([
      { op: 'set', path: ['policy', 'large-community-list', 'LCL', 'description'], value: 'x' },
    ])
  })

  it('queues nothing when unchanged', () => {
    const list = emptyList({ description: 'x' })
    expect(policyListFormToOps('as-path', 'ASPL', list, policyListToFormValues(list))).toEqual([])
  })

  it('queues a delete when description is cleared', () => {
    const list = emptyList({ description: 'x' })
    const values = policyListToFormValues(list)
    values.description = ''
    expect(policyListFormToOps('as-path', 'ASPL', list, values)).toEqual([
      { op: 'delete', path: ['policy', 'as-path-list', 'ASPL', 'description'] },
    ])
  })
})

describe('deletePolicyListOp', () => {
  it('builds a delete op for the whole list', () => {
    expect(deletePolicyListOp('community', 'CL')).toEqual({
      op: 'delete',
      path: ['policy', 'community-list', 'CL'],
    })
  })
})

describe('policyListRuleFormToOps', () => {
  it('queues nothing for a blank form', () => {
    expect(policyListRuleFormToOps('as-path', 'ASPL', '10', undefined, blankPolicyListRuleFormValues())).toEqual([])
  })

  it('queues action/description/regex on creation', () => {
    const values = blankPolicyListRuleFormValues()
    values.action = 'permit'
    values.regex = '^64512'

    const ops = policyListRuleFormToOps('as-path', 'ASPL', '10', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['policy', 'as-path-list', 'ASPL', 'rule', '10', 'action'], value: 'permit' },
      { op: 'set', path: ['policy', 'as-path-list', 'ASPL', 'rule', '10', 'regex'], value: '^64512' },
    ])
  })

  it('diffs a single field on edit', () => {
    const rule = emptyRule({ action: 'permit', regex: '^64512' })
    const values = policyListRuleToFormValues(rule)
    values.regex = '^64513'

    expect(policyListRuleFormToOps('as-path', 'ASPL', '10', rule, values)).toEqual([
      { op: 'set', path: ['policy', 'as-path-list', 'ASPL', 'rule', '10', 'regex'], value: '^64513' },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const rule = emptyRule({ description: 'old' })
    const values = policyListRuleToFormValues(rule)
    values.description = ''

    expect(policyListRuleFormToOps('community', 'CL', '10', rule, values)).toEqual([
      { op: 'delete', path: ['policy', 'community-list', 'CL', 'rule', '10', 'description'] },
    ])
  })
})

describe('deletePolicyListRuleOp', () => {
  it('builds a delete op for a single rule', () => {
    expect(deletePolicyListRuleOp('extcommunity', 'ECL', '10')).toEqual({
      op: 'delete',
      path: ['policy', 'extcommunity-list', 'ECL', 'rule', '10'],
    })
  })
})
