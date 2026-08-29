import { natStaticRulePath } from './natParse'
import type { NATStaticRule } from './natTypes'
import type { ConfigOp } from './vyosApi'

export interface NATStaticFormValues {
  description: string
  destinationAddress: string
  interfaceName: string
  translationAddress: string
  log: boolean
}

export function blankStaticFormValues(): NATStaticFormValues {
  return { description: '', destinationAddress: '', interfaceName: '', translationAddress: '', log: false }
}

export function staticToFormValues(rule: NATStaticRule): NATStaticFormValues {
  return {
    description: rule.description ?? '',
    destinationAddress: rule.destinationAddress ?? '',
    interfaceName: rule.interfaceName ?? '',
    translationAddress: rule.translationAddress ?? '',
    log: rule.log,
  }
}

interface ScalarField {
  get: (v: NATStaticFormValues) => string
  segments: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.destinationAddress, segments: ['destination', 'address'] },
  { get: (v) => v.interfaceName, segments: ['inbound-interface'] },
  { get: (v) => v.translationAddress, segments: ['translation', 'address'] },
]

/**
 * Diffs `before` against `values`, same set-or-delete-per-field
 * approach as natRuleForm.ts's ruleFormToOps. `interfaceName` is a
 * plain scalar field here (unlike source/destination rules, `nat
 * static rule <n> inbound-interface` is a bare leaf, not a node with
 * its own `name` child - see natTypes.ts's NATStaticRule doc comment).
 */
export function staticFormToOps(
  ruleNumber: string,
  before: NATStaticRule | undefined,
  values: NATStaticFormValues,
): ConfigOp[] {
  const beforeValues = before ? staticToFormValues(before) : blankStaticFormValues()
  const ops: ConfigOp[] = []

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = natStaticRulePath(ruleNumber, ...field.segments)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  if (beforeValues.log !== values.log) {
    const path = natStaticRulePath(ruleNumber, 'log')
    ops.push(values.log ? { op: 'set', path } : { op: 'delete', path })
  }

  return ops
}

export function deleteStaticRuleOp(ruleNumber: string): ConfigOp {
  return { op: 'delete', path: natStaticRulePath(ruleNumber) }
}
