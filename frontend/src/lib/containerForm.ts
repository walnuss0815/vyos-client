import { containerNamePath } from './containerParse'
import type { ContainerDefinition } from './containerTypes'
import type { ConfigOp } from './vyosApi'

export interface ContainerFormValues {
  image: string
  description: string
  entrypoint: string
  command: string
  arguments: string
  hostName: string
  restart: string
  cpuQuota: string
  memory: string
  sharedMemory: string
  uid: string
  gid: string
  logDriver: string
  disabled: boolean
  allowHostPid: boolean
  allowHostNetworks: boolean
  privileged: boolean
  capabilities: string[]
}

// Deliberately excludes name-server (multi-valued, managed via the
// generic ChipList component like every other simple multi-valued
// leaf) and the nested tagNode lists (sysctl/device/environment/
// label/network/port/tmpfs/volume) and health-check, all of which are
// only editable once a container already exists in the list - same
// convention as systemUserForm.ts's SystemUserFormValues excluding
// publicKeys, managed separately by UserList.tsx's PublicKeysSection.

export function blankContainerFormValues(): ContainerFormValues {
  return {
    image: '',
    description: '',
    entrypoint: '',
    command: '',
    arguments: '',
    hostName: '',
    restart: '',
    cpuQuota: '',
    memory: '',
    sharedMemory: '',
    uid: '',
    gid: '',
    logDriver: '',
    disabled: false,
    allowHostPid: false,
    allowHostNetworks: false,
    privileged: false,
    capabilities: [],
  }
}

export function containerToFormValues(container: ContainerDefinition): ContainerFormValues {
  return {
    image: container.image ?? '',
    description: container.description ?? '',
    entrypoint: container.entrypoint ?? '',
    command: container.command ?? '',
    arguments: container.arguments ?? '',
    hostName: container.hostName ?? '',
    restart: container.restart ?? '',
    cpuQuota: container.cpuQuota ?? '',
    memory: container.memory ?? '',
    sharedMemory: container.sharedMemory ?? '',
    uid: container.uid ?? '',
    gid: container.gid ?? '',
    logDriver: container.logDriver ?? '',
    disabled: container.disabled,
    allowHostPid: container.allowHostPid,
    allowHostNetworks: container.allowHostNetworks,
    privileged: container.privileged,
    capabilities: container.capabilities,
  }
}

interface ScalarField {
  get: (v: ContainerFormValues) => string
  segment: string
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.image, segment: 'image' },
  { get: (v) => v.description, segment: 'description' },
  { get: (v) => v.entrypoint, segment: 'entrypoint' },
  { get: (v) => v.command, segment: 'command' },
  { get: (v) => v.arguments, segment: 'arguments' },
  { get: (v) => v.hostName, segment: 'host-name' },
  { get: (v) => v.restart, segment: 'restart' },
  { get: (v) => v.cpuQuota, segment: 'cpu-quota' },
  { get: (v) => v.memory, segment: 'memory' },
  { get: (v) => v.sharedMemory, segment: 'shared-memory' },
  { get: (v) => v.uid, segment: 'uid' },
  { get: (v) => v.gid, segment: 'gid' },
  { get: (v) => v.logDriver, segment: 'log-driver' },
]

interface FlagField {
  get: (v: ContainerFormValues) => boolean
  segment: string
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.disabled, segment: 'disable' },
  { get: (v) => v.allowHostPid, segment: 'allow-host-pid' },
  { get: (v) => v.allowHostNetworks, segment: 'allow-host-networks' },
  { get: (v) => v.privileged, segment: 'privileged' },
]

/**
 * Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. `capabilities` (a fixed
 * 11-value enum, multi-valued in VyOS) is diffed as a set: added
 * values get individual `set` ops, removed values get individual
 * `delete` ops with the specific value (matching how ChipList queues
 * per-value delete ops for any other multi-valued leaf). `before ===
 * undefined` always includes a bare `set` for the container itself,
 * same convention as serviceLldpForm.ts's lldpInterfaceFormToOps -
 * without it, a new container created with every field left blank
 * (name only) queued nothing at all: every field-diff below against a
 * blank form is a no-op, so the pending-changes cart stayed empty and
 * there was nothing to commit.
 */
export function containerFormToOps(
  name: string,
  before: ContainerDefinition | undefined,
  values: ContainerFormValues,
): ConfigOp[] {
  const beforeValues = before ? containerToFormValues(before) : blankContainerFormValues()
  const ops: ConfigOp[] = []
  const base = containerNamePath(name)

  if (before === undefined) ops.push({ op: 'set', path: base })

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const oldCapabilities = new Set(beforeValues.capabilities)
  const newCapabilities = new Set(values.capabilities)
  for (const cap of newCapabilities) {
    if (!oldCapabilities.has(cap)) {
      ops.push({ op: 'set', path: [...base, 'capability'], value: cap })
    }
  }
  for (const cap of oldCapabilities) {
    if (!newCapabilities.has(cap)) {
      ops.push({ op: 'delete', path: [...base, 'capability'], value: cap })
    }
  }

  return ops
}

export function deleteContainerOp(name: string): ConfigOp {
  return { op: 'delete', path: containerNamePath(name) }
}
