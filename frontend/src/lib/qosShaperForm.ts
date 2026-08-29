import { qosClassPath, qosDefaultClassPath, qosPolicyPath } from './qosParse'
import type { QosShaperClass, QosShaperDefaultClass, QosShaperPolicy } from './qosTypes'
import type { ConfigOp } from './vyosApi'

const POLICY_TYPE = 'shaper'

export function shaperPolicyPath(name: string, ...rest: string[]): string[] {
  return qosPolicyPath(POLICY_TYPE, name, ...rest)
}

export function shaperClassPath(policyName: string, classId: string, ...rest: string[]): string[] {
  return qosClassPath(POLICY_TYPE, policyName, classId, ...rest)
}

export function shaperDefaultClassPath(policyName: string, ...rest: string[]): string[] {
  return qosDefaultClassPath(POLICY_TYPE, policyName, ...rest)
}

export interface ShaperPolicyFormValues {
  description: string
  bandwidth: string
}

export function blankShaperPolicyFormValues(): ShaperPolicyFormValues {
  return { description: '', bandwidth: 'auto' }
}

export function shaperPolicyToFormValues(policy: QosShaperPolicy): ShaperPolicyFormValues {
  return { description: policy.description ?? '', bandwidth: policy.bandwidth }
}

export function shaperPolicyFormToOps(
  name: string,
  before: QosShaperPolicy | undefined,
  values: ShaperPolicyFormValues,
): ConfigOp[] {
  const base = shaperPolicyPath(name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const beforeValues = before ? shaperPolicyToFormValues(before) : blankShaperPolicyFormValues()
  if (beforeValues.description !== values.description) {
    const path = [...base, 'description']
    if (values.description.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.description.trim() })
  }
  if (beforeValues.bandwidth !== values.bandwidth) {
    ops.push({ op: 'set', path: [...base, 'bandwidth'], value: values.bandwidth.trim() || 'auto' })
  }
  return ops
}

export function deleteShaperPolicyOp(name: string): ConfigOp {
  return { op: 'delete', path: shaperPolicyPath(name) }
}

export interface ShaperClassFormValues {
  description: string
  bandwidth: string
  burst: string
  ceiling: string
  queueType: string
  queueLimit: string
  setDscp: string
  priority: string
}

export function blankShaperClassFormValues(): ShaperClassFormValues {
  return {
    description: '',
    bandwidth: '',
    burst: '15k',
    ceiling: '',
    queueType: 'fq-codel',
    queueLimit: '',
    setDscp: '',
    priority: '',
  }
}

export function shaperClassToFormValues(cls: QosShaperClass): ShaperClassFormValues {
  return {
    description: cls.description ?? '',
    bandwidth: cls.bandwidth ?? '',
    burst: cls.burst,
    ceiling: cls.ceiling ?? '',
    queueType: cls.queueType,
    queueLimit: cls.queueLimit !== undefined ? String(cls.queueLimit) : '',
    setDscp: cls.setDscp ?? '',
    priority: cls.priority !== undefined ? String(cls.priority) : '',
  }
}

const SHAPER_CLASS_FIELDS: { get: (v: ShaperClassFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.bandwidth, segments: ['bandwidth'] },
  { get: (v) => v.burst, segments: ['burst'] },
  { get: (v) => v.ceiling, segments: ['ceiling'] },
  { get: (v) => v.queueType, segments: ['queue-type'] },
  { get: (v) => v.queueLimit, segments: ['queue-limit'] },
  { get: (v) => v.setDscp, segments: ['set-dscp'] },
  { get: (v) => v.priority, segments: ['priority'] },
]

export function shaperClassFormToOps(
  policyName: string,
  classId: string,
  before: QosShaperClass | undefined,
  values: ShaperClassFormValues,
): ConfigOp[] {
  const base = shaperClassPath(policyName, classId)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const beforeValues = before ? shaperClassToFormValues(before) : blankShaperClassFormValues()
  for (const field of SHAPER_CLASS_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deleteShaperClassOp(policyName: string, classId: string): ConfigOp {
  return { op: 'delete', path: shaperClassPath(policyName, classId) }
}

export interface ShaperDefaultClassFormValues {
  bandwidth: string
  burst: string
  ceiling: string
  queueType: string
  queueLimit: string
  setDscp: string
  priority: string
}

export function shaperDefaultClassToFormValues(cls: QosShaperDefaultClass): ShaperDefaultClassFormValues {
  return {
    bandwidth: cls.bandwidth ?? '',
    burst: cls.burst,
    ceiling: cls.ceiling ?? '',
    queueType: cls.queueType,
    queueLimit: cls.queueLimit !== undefined ? String(cls.queueLimit) : '',
    setDscp: cls.setDscp ?? '',
    priority: String(cls.priority),
  }
}

const SHAPER_DEFAULT_CLASS_FIELDS: { get: (v: ShaperDefaultClassFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.bandwidth, segments: ['bandwidth'] },
  { get: (v) => v.burst, segments: ['burst'] },
  { get: (v) => v.ceiling, segments: ['ceiling'] },
  { get: (v) => v.queueType, segments: ['queue-type'] },
  { get: (v) => v.queueLimit, segments: ['queue-limit'] },
  { get: (v) => v.setDscp, segments: ['set-dscp'] },
  { get: (v) => v.priority, segments: ['priority'] },
]

export function shaperDefaultClassFormToOps(
  policyName: string,
  before: ShaperDefaultClassFormValues,
  values: ShaperDefaultClassFormValues,
): ConfigOp[] {
  const base = shaperDefaultClassPath(policyName)
  const ops: ConfigOp[] = []
  for (const field of SHAPER_DEFAULT_CLASS_FIELDS) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}
