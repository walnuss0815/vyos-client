import { prefixListPath, prefixListRulePath } from './policyParse'
import type { PrefixList, PrefixListFamily, PrefixListRule } from './policyTypes'
import type { ConfigOp } from './vyosApi'

export interface PrefixListFormValues {
  description: string
}

export function blankPrefixListFormValues(): PrefixListFormValues {
  return { description: '' }
}

export function prefixListToFormValues(list: PrefixList): PrefixListFormValues {
  return { description: list.description ?? '' }
}

export function prefixListFormToOps(
  family: PrefixListFamily,
  name: string,
  before: PrefixList | undefined,
  values: PrefixListFormValues,
): ConfigOp[] {
  const beforeValues = before ? prefixListToFormValues(before) : blankPrefixListFormValues()
  const ops: ConfigOp[] = []
  if (beforeValues.description !== values.description) {
    const path = prefixListPath(family, name, 'description')
    if (values.description.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.description.trim() })
  }
  return ops
}

export function deletePrefixListOp(family: PrefixListFamily, name: string): ConfigOp {
  return { op: 'delete', path: prefixListPath(family, name) }
}

export interface PrefixListRuleFormValues {
  action: '' | 'permit' | 'deny'
  description: string
  prefix: string
  ge: string
  le: string
}

export function blankPrefixListRuleFormValues(): PrefixListRuleFormValues {
  return { action: '', description: '', prefix: '', ge: '', le: '' }
}

export function prefixListRuleToFormValues(rule: PrefixListRule): PrefixListRuleFormValues {
  return {
    action: rule.action ?? '',
    description: rule.description ?? '',
    prefix: rule.prefix ?? '',
    ge: rule.ge ?? '',
    le: rule.le ?? '',
  }
}

interface ScalarField {
  get: (v: PrefixListRuleFormValues) => string
  segment: string
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.action, segment: 'action' },
  { get: (v) => v.description, segment: 'description' },
  { get: (v) => v.prefix, segment: 'prefix' },
  { get: (v) => v.ge, segment: 'ge' },
  { get: (v) => v.le, segment: 'le' },
]

export function prefixListRuleFormToOps(
  family: PrefixListFamily,
  listName: string,
  ruleNumber: string,
  before: PrefixListRule | undefined,
  values: PrefixListRuleFormValues,
): ConfigOp[] {
  const beforeValues = before ? prefixListRuleToFormValues(before) : blankPrefixListRuleFormValues()
  const ops: ConfigOp[] = []
  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = prefixListRulePath(family, listName, ruleNumber, field.segment)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deletePrefixListRuleOp(
  family: PrefixListFamily,
  listName: string,
  ruleNumber: string,
): ConfigOp {
  return { op: 'delete', path: prefixListRulePath(family, listName, ruleNumber) }
}
