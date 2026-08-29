import { containerRegistryPath } from './containerParse'
import type { ContainerRegistry } from './containerTypes'
import type { ConfigOp } from './vyosApi'

export interface ContainerRegistryFormValues {
  username: string
  /** Write-only, like SystemUserFormValues.password - see that type's
   * doc comment for the general convention. Blank means "leave
   * unchanged"; always queued fresh when non-blank, regardless of
   * hasPassword. */
  password: string
  disabled: boolean
  insecure: boolean
  mirrorAddress: string
  mirrorHostName: string
  mirrorPort: string
  mirrorPath: string
}

export function blankContainerRegistryFormValues(): ContainerRegistryFormValues {
  return {
    username: '',
    password: '',
    disabled: false,
    insecure: false,
    mirrorAddress: '',
    mirrorHostName: '',
    mirrorPort: '',
    mirrorPath: '',
  }
}

export function containerRegistryToFormValues(registry: ContainerRegistry): ContainerRegistryFormValues {
  return {
    username: registry.username ?? '',
    password: '',
    disabled: registry.disabled,
    insecure: registry.insecure,
    mirrorAddress: registry.mirror?.address ?? '',
    mirrorHostName: registry.mirror?.hostName ?? '',
    mirrorPort: registry.mirror?.port ?? '',
    mirrorPath: registry.mirror?.path ?? '',
  }
}

interface ScalarField {
  get: (v: ContainerRegistryFormValues) => string
  segments: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.username, segments: ['authentication', 'username'] },
  { get: (v) => v.mirrorAddress, segments: ['mirror', 'address'] },
  { get: (v) => v.mirrorHostName, segments: ['mirror', 'host-name'] },
  { get: (v) => v.mirrorPort, segments: ['mirror', 'port'] },
  { get: (v) => v.mirrorPath, segments: ['mirror', 'path'] },
]

interface FlagField {
  get: (v: ContainerRegistryFormValues) => boolean
  segment: string
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.disabled, segment: 'disable' },
  { get: (v) => v.insecure, segment: 'insecure' },
]

/**
 * Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps, plus the write-only
 * password handling from systemUserForm.ts's userFormToOps.
 */
export function containerRegistryFormToOps(
  name: string,
  before: ContainerRegistry | undefined,
  values: ContainerRegistryFormValues,
): ConfigOp[] {
  const beforeValues = before ? containerRegistryToFormValues(before) : blankContainerRegistryFormValues()
  const ops: ConfigOp[] = []
  const base = containerRegistryPath(name)

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
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

  const trimmedPassword = values.password.trim()
  if (trimmedPassword) {
    ops.push({
      op: 'set',
      path: [...base, 'authentication', 'password'],
      value: trimmedPassword,
    })
  }

  return ops
}

export function deleteContainerRegistryOp(name: string): ConfigOp {
  return { op: 'delete', path: containerRegistryPath(name) }
}
