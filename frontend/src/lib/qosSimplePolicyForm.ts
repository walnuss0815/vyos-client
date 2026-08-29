import { qosPolicyPath } from './qosParse'
import type { QosCakePolicy, QosFqCodelPolicy, QosRateControlPolicy } from './qosTypes'
import type { ConfigOp } from './vyosApi'

/** Non-classful policy types (`cake`, `fq-codel`, `rate-control`) -
 * each is just a flat set of scalar/flag fields with no classes/
 * matches at all, so each gets its own small blank/toFormValues/
 * formToOps trio below rather than sharing one generic form (their
 * field sets differ enough - cake has two flags plus a nested
 * ack-filter flag, fq-codel is pure numeric, rate-control has
 * bandwidth/burst/latency - that a single parameterized helper
 * wouldn't meaningfully reduce code over three short ones). */

// --- cake --------------------------------------------------------------

export function cakePolicyPath(name: string, ...rest: string[]): string[] {
  return qosPolicyPath('cake', name, ...rest)
}

export interface CakeFormValues {
  description: string
  bandwidth: string
  flowIsolation: string
  flowIsolationNat: boolean
  noSplitGso: boolean
  ackFilterAggressive: boolean
  rtt: string
}

export function blankCakeFormValues(): CakeFormValues {
  return {
    description: '',
    bandwidth: '',
    flowIsolation: 'triple-isolate',
    flowIsolationNat: false,
    noSplitGso: false,
    ackFilterAggressive: false,
    rtt: '100',
  }
}

export function cakeToFormValues(policy: QosCakePolicy): CakeFormValues {
  return {
    description: policy.description ?? '',
    bandwidth: policy.bandwidth ?? '',
    flowIsolation: policy.flowIsolation,
    flowIsolationNat: policy.flowIsolationNat,
    noSplitGso: policy.noSplitGso,
    ackFilterAggressive: policy.ackFilterAggressive,
    rtt: String(policy.rtt),
  }
}

export function cakeFormToOps(name: string, before: QosCakePolicy | undefined, values: CakeFormValues): ConfigOp[] {
  const base = cakePolicyPath(name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const beforeValues = before ? cakeToFormValues(before) : blankCakeFormValues()

  const flagFields: { get: (v: CakeFormValues) => boolean; segments: string[] }[] = [
    { get: (v) => v.flowIsolationNat, segments: ['flow-isolation-nat'] },
    { get: (v) => v.noSplitGso, segments: ['no-split-gso'] },
    { get: (v) => v.ackFilterAggressive, segments: ['ack-filter', 'aggressive'] },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: CakeFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.description, segments: ['description'] },
    { get: (v) => v.bandwidth, segments: ['bandwidth'] },
    { get: (v) => v.flowIsolation, segments: ['flow-isolation'] },
    { get: (v) => v.rtt, segments: ['rtt'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deleteCakePolicyOp(name: string): ConfigOp {
  return { op: 'delete', path: cakePolicyPath(name) }
}

// --- fq-codel ------------------------------------------------------------

export function fqCodelPolicyPath(name: string, ...rest: string[]): string[] {
  return qosPolicyPath('fq-codel', name, ...rest)
}

export interface FqCodelFormValues {
  description: string
  codelQuantum: string
  flows: string
  interval: string
  queueLimit: string
  target: string
}

export function blankFqCodelFormValues(): FqCodelFormValues {
  return { description: '', codelQuantum: '', flows: '', interval: '', queueLimit: '', target: '' }
}

export function fqCodelToFormValues(policy: QosFqCodelPolicy): FqCodelFormValues {
  return {
    description: policy.description ?? '',
    codelQuantum: policy.codelQuantum !== undefined ? String(policy.codelQuantum) : '',
    flows: policy.flows !== undefined ? String(policy.flows) : '',
    interval: policy.interval !== undefined ? String(policy.interval) : '',
    queueLimit: policy.queueLimit !== undefined ? String(policy.queueLimit) : '',
    target: policy.target !== undefined ? String(policy.target) : '',
  }
}

const FQ_CODEL_FIELDS: { get: (v: FqCodelFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.codelQuantum, segments: ['codel-quantum'] },
  { get: (v) => v.flows, segments: ['flows'] },
  { get: (v) => v.interval, segments: ['interval'] },
  { get: (v) => v.queueLimit, segments: ['queue-limit'] },
  { get: (v) => v.target, segments: ['target'] },
]

export function fqCodelFormToOps(
  name: string,
  before: QosFqCodelPolicy | undefined,
  values: FqCodelFormValues,
): ConfigOp[] {
  const base = fqCodelPolicyPath(name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const beforeValues = before ? fqCodelToFormValues(before) : blankFqCodelFormValues()
  for (const field of FQ_CODEL_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deleteFqCodelPolicyOp(name: string): ConfigOp {
  return { op: 'delete', path: fqCodelPolicyPath(name) }
}

// --- rate-control (TBF) --------------------------------------------------

export function rateControlPolicyPath(name: string, ...rest: string[]): string[] {
  return qosPolicyPath('rate-control', name, ...rest)
}

export interface RateControlFormValues {
  description: string
  bandwidth: string
  burst: string
  latency: string
}

export function blankRateControlFormValues(): RateControlFormValues {
  return { description: '', bandwidth: '', burst: '15k', latency: '50' }
}

export function rateControlToFormValues(policy: QosRateControlPolicy): RateControlFormValues {
  return {
    description: policy.description ?? '',
    bandwidth: policy.bandwidth ?? '',
    burst: policy.burst,
    latency: String(policy.latency),
  }
}

const RATE_CONTROL_FIELDS: { get: (v: RateControlFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.bandwidth, segments: ['bandwidth'] },
  { get: (v) => v.burst, segments: ['burst'] },
  { get: (v) => v.latency, segments: ['latency'] },
]

export function rateControlFormToOps(
  name: string,
  before: QosRateControlPolicy | undefined,
  values: RateControlFormValues,
): ConfigOp[] {
  const base = rateControlPolicyPath(name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const beforeValues = before ? rateControlToFormValues(before) : blankRateControlFormValues()
  for (const field of RATE_CONTROL_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deleteRateControlPolicyOp(name: string): ConfigOp {
  return { op: 'delete', path: rateControlPolicyPath(name) }
}
