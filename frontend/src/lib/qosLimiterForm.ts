import { qosClassPath, qosDefaultClassPath, qosPolicyPath } from './qosParse'
import type { QosLimiterClass, QosLimiterDefaultClass, QosLimiterPolicy } from './qosTypes'
import type { ConfigOp } from './vyosApi'

const POLICY_TYPE = 'limiter'

export function limiterPolicyPath(name: string, ...rest: string[]): string[] {
  return qosPolicyPath(POLICY_TYPE, name, ...rest)
}

export function limiterClassPath(policyName: string, classId: string, ...rest: string[]): string[] {
  return qosClassPath(POLICY_TYPE, policyName, classId, ...rest)
}

export function limiterDefaultClassPath(policyName: string, ...rest: string[]): string[] {
  return qosDefaultClassPath(POLICY_TYPE, policyName, ...rest)
}

export interface LimiterPolicyFormValues {
  description: string
}

export function limiterPolicyFormToOps(
  name: string,
  before: QosLimiterPolicy | undefined,
  values: LimiterPolicyFormValues,
): ConfigOp[] {
  const base = limiterPolicyPath(name)
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

export function deleteLimiterPolicyOp(name: string): ConfigOp {
  return { op: 'delete', path: limiterPolicyPath(name) }
}

export interface LimiterClassFormValues {
  description: string
  bandwidth: string
  burst: string
  mtu: string
  policeExceed: string
  policeNotExceed: string
  priority: string
}

export function blankLimiterClassFormValues(): LimiterClassFormValues {
  return { description: '', bandwidth: '', burst: '15k', mtu: '', policeExceed: 'drop', policeNotExceed: 'ok', priority: '20' }
}

export function limiterClassToFormValues(cls: QosLimiterClass): LimiterClassFormValues {
  return {
    description: cls.description ?? '',
    bandwidth: cls.bandwidth ?? '',
    burst: cls.burst,
    mtu: cls.mtu !== undefined ? String(cls.mtu) : '',
    policeExceed: cls.police.exceed,
    policeNotExceed: cls.police.notExceed,
    priority: String(cls.priority),
  }
}

const CLASS_SCALAR_FIELDS: { get: (v: LimiterClassFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.bandwidth, segments: ['bandwidth'] },
  { get: (v) => v.burst, segments: ['burst'] },
  { get: (v) => v.mtu, segments: ['mtu'] },
  { get: (v) => v.policeExceed, segments: ['exceed'] },
  { get: (v) => v.policeNotExceed, segments: ['not-exceed'] },
  { get: (v) => v.priority, segments: ['priority'] },
]

export function limiterClassFormToOps(
  policyName: string,
  classId: string,
  before: QosLimiterClass | undefined,
  values: LimiterClassFormValues,
): ConfigOp[] {
  const base = limiterClassPath(policyName, classId)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const beforeValues = before ? limiterClassToFormValues(before) : blankLimiterClassFormValues()
  for (const field of CLASS_SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deleteLimiterClassOp(policyName: string, classId: string): ConfigOp {
  return { op: 'delete', path: limiterClassPath(policyName, classId) }
}

export interface LimiterDefaultClassFormValues {
  bandwidth: string
  burst: string
  mtu: string
  policeExceed: string
  policeNotExceed: string
}

export function limiterDefaultClassToFormValues(cls: QosLimiterDefaultClass): LimiterDefaultClassFormValues {
  return {
    bandwidth: cls.bandwidth ?? '',
    burst: cls.burst,
    mtu: cls.mtu !== undefined ? String(cls.mtu) : '',
    policeExceed: cls.police.exceed,
    policeNotExceed: cls.police.notExceed,
  }
}

const DEFAULT_CLASS_SCALAR_FIELDS: { get: (v: LimiterDefaultClassFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.bandwidth, segments: ['bandwidth'] },
  { get: (v) => v.burst, segments: ['burst'] },
  { get: (v) => v.mtu, segments: ['mtu'] },
  { get: (v) => v.policeExceed, segments: ['exceed'] },
  { get: (v) => v.policeNotExceed, segments: ['not-exceed'] },
]

export function limiterDefaultClassFormToOps(
  policyName: string,
  before: LimiterDefaultClassFormValues,
  values: LimiterDefaultClassFormValues,
): ConfigOp[] {
  const base = limiterDefaultClassPath(policyName)
  const ops: ConfigOp[] = []
  for (const field of DEFAULT_CLASS_SCALAR_FIELDS) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}
