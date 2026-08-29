import { qosMatchGroupPath } from './qosParse'
import type { QosMatchGroup } from './qosTypes'
import type { ConfigOp } from './vyosApi'

export interface MatchGroupFormValues {
  description: string
}

export function blankMatchGroupFormValues(): MatchGroupFormValues {
  return { description: '' }
}

export function matchGroupToFormValues(group: QosMatchGroup): MatchGroupFormValues {
  return { description: group.description ?? '' }
}

export function matchGroupFormToOps(
  name: string,
  before: QosMatchGroup | undefined,
  values: MatchGroupFormValues,
): ConfigOp[] {
  const base = qosMatchGroupPath(name)
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

export function deleteMatchGroupOp(name: string): ConfigOp {
  return { op: 'delete', path: qosMatchGroupPath(name) }
}
