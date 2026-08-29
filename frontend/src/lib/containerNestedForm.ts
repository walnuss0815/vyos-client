import {
  containerDevicePath,
  containerHealthCheckPath,
  containerNetworkAttachmentPath,
  containerPortPath,
  containerTmpfsPath,
  containerVolumePath,
} from './containerParse'
import type { ContainerHealthCheck } from './containerTypes'
import type { ConfigOp } from './vyosApi'

/**
 * Add/remove op builders for `container name <name>`'s nested
 * tagNode-keyed lists that need more than one field per entry
 * (device, port, volume, tmpfs, network attachment). Each entry's
 * *multi*-valued sub-fields (a port's `listen-address`, a network
 * attachment's `address`) are deliberately NOT included here - they're
 * only editable once the entry already exists in the list, via the
 * generic ChipList component, same convention as
 * systemUserForm.ts/UserList.tsx's split between "create the parent
 * resource" (this file) and "manage its nested multi-valued leaves"
 * (ChipList, wired up directly in the section components).
 *
 * `environment`/`label`/`sysctl parameter` entries (simple id+value
 * pairs) don't need dedicated functions here - they're handled
 * directly by the generic KeyValuePairList component, the same way
 * ChipList builds its own ops inline for any other simple multi-valued
 * leaf.
 */

export function addDeviceOps(
  containerName: string,
  id: string,
  source: string,
  destination: string,
): ConfigOp[] {
  const base = containerDevicePath(containerName, id)
  const ops: ConfigOp[] = []
  const trimmedSource = source.trim()
  const trimmedDestination = destination.trim()
  if (trimmedSource) ops.push({ op: 'set', path: [...base, 'source'], value: trimmedSource })
  if (trimmedDestination) ops.push({ op: 'set', path: [...base, 'destination'], value: trimmedDestination })
  return ops
}

export function removeDeviceOp(containerName: string, id: string): ConfigOp {
  return { op: 'delete', path: containerDevicePath(containerName, id) }
}

export function addPortOps(
  containerName: string,
  id: string,
  source: string,
  destination: string,
  protocol: string,
): ConfigOp[] {
  const base = containerPortPath(containerName, id)
  const ops: ConfigOp[] = []
  const trimmedSource = source.trim()
  const trimmedDestination = destination.trim()
  if (trimmedSource) ops.push({ op: 'set', path: [...base, 'source'], value: trimmedSource })
  if (trimmedDestination) ops.push({ op: 'set', path: [...base, 'destination'], value: trimmedDestination })
  if (protocol) ops.push({ op: 'set', path: [...base, 'protocol'], value: protocol })
  return ops
}

export function removePortOp(containerName: string, id: string): ConfigOp {
  return { op: 'delete', path: containerPortPath(containerName, id) }
}

export function addVolumeOps(
  containerName: string,
  id: string,
  source: string,
  destination: string,
  mode: string,
  propagation: string,
): ConfigOp[] {
  const base = containerVolumePath(containerName, id)
  const ops: ConfigOp[] = []
  const trimmedSource = source.trim()
  const trimmedDestination = destination.trim()
  if (trimmedSource) ops.push({ op: 'set', path: [...base, 'source'], value: trimmedSource })
  if (trimmedDestination) ops.push({ op: 'set', path: [...base, 'destination'], value: trimmedDestination })
  if (mode) ops.push({ op: 'set', path: [...base, 'mode'], value: mode })
  if (propagation) ops.push({ op: 'set', path: [...base, 'propagation'], value: propagation })
  return ops
}

export function removeVolumeOp(containerName: string, id: string): ConfigOp {
  return { op: 'delete', path: containerVolumePath(containerName, id) }
}

export function addTmpfsOps(containerName: string, id: string, destination: string, size: string): ConfigOp[] {
  const base = containerTmpfsPath(containerName, id)
  const ops: ConfigOp[] = []
  const trimmedDestination = destination.trim()
  const trimmedSize = size.trim()
  if (trimmedDestination) ops.push({ op: 'set', path: [...base, 'destination'], value: trimmedDestination })
  if (trimmedSize) ops.push({ op: 'set', path: [...base, 'size'], value: trimmedSize })
  return ops
}

export function removeTmpfsOp(containerName: string, id: string): ConfigOp {
  return { op: 'delete', path: containerTmpfsPath(containerName, id) }
}

export function addNetworkAttachmentOps(containerName: string, networkName: string, mac: string): ConfigOp[] {
  const base = containerNetworkAttachmentPath(containerName, networkName)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmedMac = mac.trim()
  if (trimmedMac) ops.push({ op: 'set', path: [...base, 'mac'], value: trimmedMac })
  return ops
}

export function removeNetworkAttachmentOp(containerName: string, networkName: string): ConfigOp {
  return { op: 'delete', path: containerNetworkAttachmentPath(containerName, networkName) }
}

export interface HealthCheckFormValues {
  command: string
  interval: string
  timeout: string
  retry: string
}

export function blankHealthCheckFormValues(): HealthCheckFormValues {
  return { command: '', interval: '', timeout: '', retry: '' }
}

export function healthCheckToFormValues(hc: ContainerHealthCheck): HealthCheckFormValues {
  return {
    command: hc.command ?? '',
    interval: hc.interval ?? '',
    timeout: hc.timeout ?? '',
    retry: hc.retry ?? '',
  }
}

const HEALTH_CHECK_FIELDS: { get: (v: HealthCheckFormValues) => string; segment: string }[] = [
  { get: (v) => v.command, segment: 'command' },
  { get: (v) => v.interval, segment: 'interval' },
  { get: (v) => v.timeout, segment: 'timeout' },
  { get: (v) => v.retry, segment: 'retry' },
]

export function healthCheckFormToOps(
  containerName: string,
  before: ContainerHealthCheck,
  values: HealthCheckFormValues,
): ConfigOp[] {
  const beforeValues = healthCheckToFormValues(before)
  const ops: ConfigOp[] = []
  const base = containerHealthCheckPath(containerName)

  for (const field of HEALTH_CHECK_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}
