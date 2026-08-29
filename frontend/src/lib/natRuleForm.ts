import { natRuleInterfacePath, natRulePath } from './natParse'
import type { NATMatch, NATRule, NATRuleKind } from './natTypes'
import type { ConfigOp } from './vyosApi'

export interface NATMatchFormValues {
  address: string
  port: string
  addressGroup: string
  networkGroup: string
  portGroup: string
}

export interface NATRuleFormValues {
  description: string
  interfaceName: string
  protocol: string
  source: NATMatchFormValues
  destination: NATMatchFormValues
  /** Source rules only - blank (and not shown/edited) for destination
   * rules. Accepts the literal string 'masquerade'. */
  translationAddress: string
  translationPort: string
  /** Destination rules only - blank (and not shown/edited) for
   * source rules. */
  redirectPort: string
  disabled: boolean
  exclude: boolean
  log: boolean
}

function blankMatch(): NATMatchFormValues {
  return { address: '', port: '', addressGroup: '', networkGroup: '', portGroup: '' }
}

export function blankRuleFormValues(): NATRuleFormValues {
  return {
    description: '',
    interfaceName: '',
    protocol: '',
    source: blankMatch(),
    destination: blankMatch(),
    translationAddress: '',
    translationPort: '',
    redirectPort: '',
    disabled: false,
    exclude: false,
    log: false,
  }
}

function matchToFormValues(match: NATMatch): NATMatchFormValues {
  return {
    address: match.address ?? '',
    port: match.port ?? '',
    addressGroup: match.addressGroup ?? '',
    networkGroup: match.networkGroup ?? '',
    portGroup: match.portGroup ?? '',
  }
}

export function ruleToFormValues(rule: NATRule): NATRuleFormValues {
  return {
    description: rule.description ?? '',
    interfaceName: rule.interfaceName ?? '',
    protocol: rule.protocol ?? '',
    source: matchToFormValues(rule.source),
    destination: matchToFormValues(rule.destination),
    translationAddress: rule.translationAddress ?? '',
    translationPort: rule.translationPort ?? '',
    redirectPort: rule.redirectPort ?? '',
    disabled: rule.disabled,
    exclude: rule.exclude,
    log: rule.log,
  }
}

interface ScalarField {
  get: (v: NATRuleFormValues) => string
  segments: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.protocol, segments: ['protocol'] },
  { get: (v) => v.source.address, segments: ['source', 'address'] },
  { get: (v) => v.source.port, segments: ['source', 'port'] },
  { get: (v) => v.source.addressGroup, segments: ['source', 'group', 'address-group'] },
  { get: (v) => v.source.networkGroup, segments: ['source', 'group', 'network-group'] },
  { get: (v) => v.source.portGroup, segments: ['source', 'group', 'port-group'] },
  { get: (v) => v.destination.address, segments: ['destination', 'address'] },
  { get: (v) => v.destination.port, segments: ['destination', 'port'] },
  { get: (v) => v.destination.addressGroup, segments: ['destination', 'group', 'address-group'] },
  { get: (v) => v.destination.networkGroup, segments: ['destination', 'group', 'network-group'] },
  { get: (v) => v.destination.portGroup, segments: ['destination', 'group', 'port-group'] },
  { get: (v) => v.translationAddress, segments: ['translation', 'address'] },
  { get: (v) => v.translationPort, segments: ['translation', 'port'] },
  { get: (v) => v.redirectPort, segments: ['translation', 'redirect', 'port'] },
]

interface FlagField {
  get: (v: NATRuleFormValues) => boolean
  segments: string[]
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.disabled, segments: ['disable'] },
  { get: (v) => v.exclude, segments: ['exclude'] },
  { get: (v) => v.log, segments: ['log'] },
]

/**
 * Diffs `before` (the rule as last fetched, or undefined when
 * creating a new rule) against `values`, same approach as
 * firewallRuleForm.ts's ruleFormToOps. `interfaceName` is handled
 * separately from SCALAR_FIELDS since its path's node name
 * (outbound-interface vs inbound-interface) depends on `kind` - see
 * natRuleInterfacePath.
 */
export function ruleFormToOps(
  kind: NATRuleKind,
  ruleNumber: string,
  before: NATRule | undefined,
  values: NATRuleFormValues,
): ConfigOp[] {
  const beforeValues = before ? ruleToFormValues(before) : blankRuleFormValues()
  const ops: ConfigOp[] = []

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = natRulePath(kind, ruleNumber, ...field.segments)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  if (beforeValues.interfaceName !== values.interfaceName) {
    const path = natRuleInterfacePath(kind, ruleNumber, 'name')
    if (values.interfaceName.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.interfaceName.trim() })
  }

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = natRulePath(kind, ruleNumber, ...field.segments)
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  return ops
}

export function deleteRuleOp(kind: NATRuleKind, ruleNumber: string): ConfigOp {
  return { op: 'delete', path: natRulePath(kind, ruleNumber) }
}
