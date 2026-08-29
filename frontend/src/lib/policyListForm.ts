import { policyListPath, policyListRulePath } from './policyParse'
import type { PolicyList, PolicyListKind, PolicyListRule } from './policyTypes'
import type { ConfigOp } from './vyosApi'

// --- the named list itself (as-path-list/community-list/etc.) ----------

export interface PolicyListFormValues {
  description: string
}

export function blankPolicyListFormValues(): PolicyListFormValues {
  return { description: '' }
}

export function policyListToFormValues(list: PolicyList): PolicyListFormValues {
  return { description: list.description ?? '' }
}

export function policyListFormToOps(
  kind: PolicyListKind,
  name: string,
  before: PolicyList | undefined,
  values: PolicyListFormValues,
): ConfigOp[] {
  const beforeValues = before ? policyListToFormValues(before) : blankPolicyListFormValues()
  const ops: ConfigOp[] = []
  if (beforeValues.description !== values.description) {
    const path = policyListPath(kind, name, 'description')
    if (values.description.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.description.trim() })
  }
  return ops
}

export function deletePolicyListOp(kind: PolicyListKind, name: string): ConfigOp {
  return { op: 'delete', path: policyListPath(kind, name) }
}

// --- rules within a list -------------------------------------------------

export interface PolicyListRuleFormValues {
  action: '' | 'permit' | 'deny'
  description: string
  regex: string
}

export function blankPolicyListRuleFormValues(): PolicyListRuleFormValues {
  return { action: '', description: '', regex: '' }
}

export function policyListRuleToFormValues(rule: PolicyListRule): PolicyListRuleFormValues {
  return {
    action: rule.action ?? '',
    description: rule.description ?? '',
    regex: rule.regex ?? '',
  }
}

interface ScalarField {
  get: (v: PolicyListRuleFormValues) => string
  segment: string
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.action, segment: 'action' },
  { get: (v) => v.description, segment: 'description' },
  { get: (v) => v.regex, segment: 'regex' },
]

export function policyListRuleFormToOps(
  kind: PolicyListKind,
  listName: string,
  ruleNumber: string,
  before: PolicyListRule | undefined,
  values: PolicyListRuleFormValues,
): ConfigOp[] {
  const beforeValues = before ? policyListRuleToFormValues(before) : blankPolicyListRuleFormValues()
  const ops: ConfigOp[] = []
  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = policyListRulePath(kind, listName, ruleNumber, field.segment)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deletePolicyListRuleOp(kind: PolicyListKind, listName: string, ruleNumber: string): ConfigOp {
  return { op: 'delete', path: policyListRulePath(kind, listName, ruleNumber) }
}
