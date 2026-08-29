import { qosClassPath, qosDefaultClassPath, qosPolicyPath } from './qosParse'
import type { QosHfscClass, QosHfscCurve, QosHfscDefaultClass, QosShaperHfscPolicy } from './qosTypes'
import type { ConfigOp } from './vyosApi'

const POLICY_TYPE = 'shaper-hfsc'

export function shaperHfscPolicyPath(name: string, ...rest: string[]): string[] {
  return qosPolicyPath(POLICY_TYPE, name, ...rest)
}

export function shaperHfscClassPath(policyName: string, classId: string, ...rest: string[]): string[] {
  return qosClassPath(POLICY_TYPE, policyName, classId, ...rest)
}

export function shaperHfscDefaultClassPath(policyName: string, ...rest: string[]): string[] {
  return qosDefaultClassPath(POLICY_TYPE, policyName, ...rest)
}

export interface ShaperHfscPolicyFormValues {
  description: string
  bandwidth: string
}

export function blankShaperHfscPolicyFormValues(): ShaperHfscPolicyFormValues {
  return { description: '', bandwidth: 'auto' }
}

export function shaperHfscPolicyToFormValues(policy: QosShaperHfscPolicy): ShaperHfscPolicyFormValues {
  return { description: policy.description ?? '', bandwidth: policy.bandwidth }
}

export function shaperHfscPolicyFormToOps(
  name: string,
  before: QosShaperHfscPolicy | undefined,
  values: ShaperHfscPolicyFormValues,
): ConfigOp[] {
  const base = shaperHfscPolicyPath(name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const beforeValues = before ? shaperHfscPolicyToFormValues(before) : blankShaperHfscPolicyFormValues()
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

export function deleteShaperHfscPolicyOp(name: string): ConfigOp {
  return { op: 'delete', path: shaperHfscPolicyPath(name) }
}

/** Curve form values, flattened for one of linkshare/realtime/
 * upperlimit - see QosHfscCurve's own doc comment for what d/m1/m2
 * mean. */
export interface HfscCurveFormValues {
  d: string
  m1: string
  m2: string
}

function blankCurveFormValues(): HfscCurveFormValues {
  return { d: '', m1: '', m2: '' }
}

function curveToFormValues(curve: QosHfscCurve): HfscCurveFormValues {
  return { d: curve.d !== undefined ? String(curve.d) : '', m1: curve.m1 ?? '', m2: curve.m2 ?? '' }
}

function curveOps(base: string[], before: HfscCurveFormValues, values: HfscCurveFormValues): ConfigOp[] {
  const ops: ConfigOp[] = []
  const fields: (keyof HfscCurveFormValues)[] = ['d', 'm1', 'm2']
  for (const field of fields) {
    const oldValue = before[field]
    const newValue = values[field]
    if (oldValue === newValue) continue
    const path = [...base, field]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export interface HfscClassFormValues {
  description: string
  linkshare: HfscCurveFormValues
  realtime: HfscCurveFormValues
  upperlimit: HfscCurveFormValues
}

export function blankHfscClassFormValues(): HfscClassFormValues {
  return {
    description: '',
    linkshare: blankCurveFormValues(),
    realtime: blankCurveFormValues(),
    upperlimit: blankCurveFormValues(),
  }
}

export function hfscClassToFormValues(cls: QosHfscClass): HfscClassFormValues {
  return {
    description: cls.description ?? '',
    linkshare: curveToFormValues(cls.linkshare),
    realtime: curveToFormValues(cls.realtime),
    upperlimit: curveToFormValues(cls.upperlimit),
  }
}

export function hfscClassFormToOps(
  policyName: string,
  classId: string,
  before: QosHfscClass | undefined,
  values: HfscClassFormValues,
): ConfigOp[] {
  const base = shaperHfscClassPath(policyName, classId)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })
  const beforeValues = before ? hfscClassToFormValues(before) : blankHfscClassFormValues()

  if (beforeValues.description !== values.description) {
    const path = [...base, 'description']
    if (values.description.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.description.trim() })
  }
  ops.push(...curveOps([...base, 'linkshare'], beforeValues.linkshare, values.linkshare))
  ops.push(...curveOps([...base, 'realtime'], beforeValues.realtime, values.realtime))
  ops.push(...curveOps([...base, 'upperlimit'], beforeValues.upperlimit, values.upperlimit))
  return ops
}

export function deleteHfscClassOp(policyName: string, classId: string): ConfigOp {
  return { op: 'delete', path: shaperHfscClassPath(policyName, classId) }
}

export interface HfscDefaultClassFormValues {
  linkshare: HfscCurveFormValues
  realtime: HfscCurveFormValues
  upperlimit: HfscCurveFormValues
}

export function hfscDefaultClassToFormValues(cls: QosHfscDefaultClass): HfscDefaultClassFormValues {
  return {
    linkshare: curveToFormValues(cls.linkshare),
    realtime: curveToFormValues(cls.realtime),
    upperlimit: curveToFormValues(cls.upperlimit),
  }
}

export function hfscDefaultClassFormToOps(
  policyName: string,
  before: HfscDefaultClassFormValues,
  values: HfscDefaultClassFormValues,
): ConfigOp[] {
  const base = shaperHfscDefaultClassPath(policyName)
  return [
    ...curveOps([...base, 'linkshare'], before.linkshare, values.linkshare),
    ...curveOps([...base, 'realtime'], before.realtime, values.realtime),
    ...curveOps([...base, 'upperlimit'], before.upperlimit, values.upperlimit),
  ]
}
