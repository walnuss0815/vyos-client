import { broadcastRelayInstancePath, broadcastRelayPath } from './serviceBroadcastRelayParse'
import type { BroadcastRelayInstance } from './serviceBroadcastRelayTypes'
import type { ConfigOp } from './vyosApi'

export interface BroadcastRelayInstanceFormValues {
  disabled: boolean
  address: string
  description: string
  port: string
}

export function blankBroadcastRelayInstanceFormValues(): BroadcastRelayInstanceFormValues {
  return { disabled: false, address: '', description: '', port: '' }
}

export function broadcastRelayInstanceToFormValues(
  instance: BroadcastRelayInstance,
): BroadcastRelayInstanceFormValues {
  return {
    disabled: instance.disabled,
    address: instance.address ?? '',
    description: instance.description ?? '',
    port: instance.port ?? '',
  }
}

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. `before === undefined`
 * always includes a bare `set` for the instance tag itself, same
 * convention as containerNestedForm.ts's addNetworkAttachmentOps. */
export function broadcastRelayInstanceFormToOps(
  id: string,
  before: BroadcastRelayInstance | undefined,
  values: BroadcastRelayInstanceFormValues,
): ConfigOp[] {
  const beforeValues = before
    ? broadcastRelayInstanceToFormValues(before)
    : blankBroadcastRelayInstanceFormValues()
  const ops: ConfigOp[] = []
  const base = broadcastRelayInstancePath(id)

  if (before === undefined) ops.push({ op: 'set', path: base })

  if (beforeValues.disabled !== values.disabled) {
    const path = [...base, 'disable']
    ops.push(values.disabled ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: BroadcastRelayInstanceFormValues) => string; segment: string }[] = [
    { get: (v) => v.address, segment: 'address' },
    { get: (v) => v.description, segment: 'description' },
    { get: (v) => v.port, segment: 'port' },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function deleteBroadcastRelayInstanceOp(id: string): ConfigOp {
  return { op: 'delete', path: broadcastRelayInstancePath(id) }
}

export function enableBroadcastRelayOp(): ConfigOp {
  return { op: 'set', path: broadcastRelayPath() }
}

export function disableBroadcastRelayOp(): ConfigOp {
  return { op: 'delete', path: broadcastRelayPath() }
}

export function toggleBroadcastRelayServiceDisableOp(disabled: boolean): ConfigOp {
  const path = broadcastRelayPath('disable')
  return disabled ? { op: 'set', path } : { op: 'delete', path }
}
