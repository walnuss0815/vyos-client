import { qosClassPath, qosDefaultClassPath, qosPolicyPath } from './qosParse'
import type { QosSimpleClassfulClass, QosSimpleClassfulDefaultClass } from './qosTypes'
import type { ConfigOp } from './vyosApi'

/** Shared form helpers for `priority-queue` and `round-robin` -
 * structurally identical policy/class/default shapes (see
 * qosTypes.ts's QosSimpleClassfulClass doc comment), parameterized by
 * `policyType` so one set of functions covers both rather than
 * duplicating them. */
export type SimpleClassfulPolicyType = 'priority-queue' | 'round-robin'

export function simpleClassfulPolicyPath(policyType: SimpleClassfulPolicyType, name: string, ...rest: string[]): string[] {
  return qosPolicyPath(policyType, name, ...rest)
}

export function simpleClassfulClassPath(
  policyType: SimpleClassfulPolicyType,
  policyName: string,
  classId: string,
  ...rest: string[]
): string[] {
  return qosClassPath(policyType, policyName, classId, ...rest)
}

export function simpleClassfulDefaultClassPath(
  policyType: SimpleClassfulPolicyType,
  policyName: string,
  ...rest: string[]
): string[] {
  return qosDefaultClassPath(policyType, policyName, ...rest)
}

export interface SimpleClassfulPolicyFormValues {
  description: string
}

export function simpleClassfulPolicyFormToOps(
  policyType: SimpleClassfulPolicyType,
  name: string,
  before: { description?: string } | undefined,
  values: SimpleClassfulPolicyFormValues,
): ConfigOp[] {
  const base = simpleClassfulPolicyPath(policyType, name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const oldDescription = before?.description ?? ''
  if (oldDescription !== values.description) {
    const path = [...base, 'description']
    if (values.description.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.description.trim() })
  }
  return ops
}

export function deleteSimpleClassfulPolicyOp(policyType: SimpleClassfulPolicyType, name: string): ConfigOp {
  return { op: 'delete', path: simpleClassfulPolicyPath(policyType, name) }
}

export interface SimpleClassfulClassFormValues {
  description: string
  codelQuantum: string
  flows: string
  interval: string
  /** round-robin only - ignored (never emitted) for priority-queue. */
  quantum: string
  queueLimit: string
  queueType: string
  target: string
}

export function blankSimpleClassfulClassFormValues(defaultQueueType: string): SimpleClassfulClassFormValues {
  return {
    description: '',
    codelQuantum: '',
    flows: '',
    interval: '',
    quantum: '',
    queueLimit: '',
    queueType: defaultQueueType,
    target: '',
  }
}

export function simpleClassfulClassToFormValues(cls: QosSimpleClassfulClass): SimpleClassfulClassFormValues {
  return {
    description: cls.description ?? '',
    codelQuantum: cls.codelQuantum !== undefined ? String(cls.codelQuantum) : '',
    flows: cls.flows !== undefined ? String(cls.flows) : '',
    interval: cls.interval !== undefined ? String(cls.interval) : '',
    quantum: cls.quantum !== undefined ? String(cls.quantum) : '',
    queueLimit: cls.queueLimit !== undefined ? String(cls.queueLimit) : '',
    queueType: cls.queueType,
    target: cls.target !== undefined ? String(cls.target) : '',
  }
}

const CLASS_FIELDS: { get: (v: SimpleClassfulClassFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.codelQuantum, segments: ['codel-quantum'] },
  { get: (v) => v.flows, segments: ['flows'] },
  { get: (v) => v.interval, segments: ['interval'] },
  { get: (v) => v.quantum, segments: ['quantum'] },
  { get: (v) => v.queueLimit, segments: ['queue-limit'] },
  { get: (v) => v.queueType, segments: ['queue-type'] },
  { get: (v) => v.target, segments: ['target'] },
]

export function simpleClassfulClassFormToOps(
  policyType: SimpleClassfulPolicyType,
  policyName: string,
  classId: string,
  before: QosSimpleClassfulClass | undefined,
  values: SimpleClassfulClassFormValues,
): ConfigOp[] {
  const base = simpleClassfulClassPath(policyType, policyName, classId)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const beforeValues = before
    ? simpleClassfulClassToFormValues(before)
    : blankSimpleClassfulClassFormValues(values.queueType)
  const fields = policyType === 'round-robin' ? CLASS_FIELDS : CLASS_FIELDS.filter((f) => f.segments[0] !== 'quantum')
  for (const field of fields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deleteSimpleClassfulClassOp(
  policyType: SimpleClassfulPolicyType,
  policyName: string,
  classId: string,
): ConfigOp {
  return { op: 'delete', path: simpleClassfulClassPath(policyType, policyName, classId) }
}

export interface SimpleClassfulDefaultClassFormValues {
  codelQuantum: string
  flows: string
  interval: string
  queueLimit: string
  queueType: string
  target: string
}

export function simpleClassfulDefaultClassToFormValues(cls: QosSimpleClassfulDefaultClass): SimpleClassfulDefaultClassFormValues {
  return {
    codelQuantum: cls.codelQuantum !== undefined ? String(cls.codelQuantum) : '',
    flows: cls.flows !== undefined ? String(cls.flows) : '',
    interval: cls.interval !== undefined ? String(cls.interval) : '',
    queueLimit: cls.queueLimit !== undefined ? String(cls.queueLimit) : '',
    queueType: cls.queueType,
    target: cls.target !== undefined ? String(cls.target) : '',
  }
}

const DEFAULT_CLASS_FIELDS: { get: (v: SimpleClassfulDefaultClassFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.codelQuantum, segments: ['codel-quantum'] },
  { get: (v) => v.flows, segments: ['flows'] },
  { get: (v) => v.interval, segments: ['interval'] },
  { get: (v) => v.queueLimit, segments: ['queue-limit'] },
  { get: (v) => v.queueType, segments: ['queue-type'] },
  { get: (v) => v.target, segments: ['target'] },
]

export function simpleClassfulDefaultClassFormToOps(
  policyType: SimpleClassfulPolicyType,
  policyName: string,
  before: SimpleClassfulDefaultClassFormValues,
  values: SimpleClassfulDefaultClassFormValues,
): ConfigOp[] {
  const base = simpleClassfulDefaultClassPath(policyType, policyName)
  const ops: ConfigOp[] = []
  for (const field of DEFAULT_CLASS_FIELDS) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}
