import { ospfInterfacePath } from './ospfParse'
import type { OSPFInterface, OSPFInterfaceAuthMode, OSPFProtocol } from './ospfTypes'
import type { ConfigOp } from './vyosApi'

export interface OSPFInterfaceFormValues {
  area: string
  cost: string
  priority: string
  deadInterval: string
  helloInterval: string
  passive: boolean
  networkType: string
  mtuIgnore: boolean
  bfd: boolean
  /** OSPFv2 only - '' means no authentication configured. */
  authMode: '' | OSPFInterfaceAuthMode
  /** Write-only, like BGPPeerFormValues.password - see that type's
   * doc comment for the general convention. Blank means "leave
   * unchanged"; always queued fresh when non-blank. */
  plaintextPassword: string
  md5KeyId: string
  /** Write-only, same convention as plaintextPassword. */
  md5Key: string
}

export function blankInterfaceFormValues(): OSPFInterfaceFormValues {
  return {
    area: '',
    cost: '',
    priority: '',
    deadInterval: '',
    helloInterval: '',
    passive: false,
    networkType: '',
    mtuIgnore: false,
    bfd: false,
    authMode: '',
    plaintextPassword: '',
    md5KeyId: '',
    md5Key: '',
  }
}

export function interfaceToFormValues(iface: OSPFInterface): OSPFInterfaceFormValues {
  return {
    area: iface.area ?? '',
    cost: iface.cost ?? '',
    priority: iface.priority ?? '',
    deadInterval: iface.deadInterval ?? '',
    helloInterval: iface.helloInterval ?? '',
    passive: iface.passive,
    networkType: iface.networkType ?? '',
    mtuIgnore: iface.mtuIgnore,
    bfd: iface.bfd,
    authMode: iface.authMode ?? '',
    plaintextPassword: '',
    md5KeyId: iface.md5KeyId ?? '',
    md5Key: '',
  }
}

interface ScalarField {
  get: (v: OSPFInterfaceFormValues) => string
  segment: string
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.area, segment: 'area' },
  { get: (v) => v.cost, segment: 'cost' },
  { get: (v) => v.priority, segment: 'priority' },
  { get: (v) => v.deadInterval, segment: 'dead-interval' },
  { get: (v) => v.helloInterval, segment: 'hello-interval' },
  { get: (v) => v.networkType, segment: 'network' },
]

interface FlagField {
  get: (v: OSPFInterfaceFormValues) => boolean
  segment: string
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.passive, segment: 'passive' },
  { get: (v) => v.mtuIgnore, segment: 'mtu-ignore' },
  { get: (v) => v.bfd, segment: 'bfd' },
]

/**
 * Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. Authentication
 * (OSPFv2 only) is a discriminated union like ospfAreaForm.ts's
 * area-type: switching modes (or switching which md5 key-id is
 * active) clears the whole `authentication` node first and rebuilds
 * it; staying on the same mode/key-id only ever queues a fresh
 * write-only password/key value when the user actually typed one -
 * it never diffs against the previous value, since the previous
 * value is masked/unknown to this app.
 */
export function interfaceFormToOps(
  protocol: OSPFProtocol,
  name: string,
  before: OSPFInterface | undefined,
  values: OSPFInterfaceFormValues,
): ConfigOp[] {
  const beforeValues = before ? interfaceToFormValues(before) : blankInterfaceFormValues()
  const ops: ConfigOp[] = []
  const base = ospfInterfacePath(protocol, name)

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

  if (protocol === 'ospf') {
    const authModeChanged = beforeValues.authMode !== values.authMode
    const keyIdChanged = values.authMode === 'md5' && beforeValues.md5KeyId !== values.md5KeyId

    if (authModeChanged || keyIdChanged) {
      if (beforeValues.authMode !== '') {
        ops.push({ op: 'delete', path: [...base, 'authentication'] })
      }
      if (values.authMode === 'plaintext-password') {
        const password = values.plaintextPassword.trim()
        if (password) {
          ops.push({ op: 'set', path: [...base, 'authentication', 'plaintext-password'], value: password })
        }
      } else if (values.authMode === 'md5') {
        const keyId = values.md5KeyId.trim()
        if (keyId) {
          const keyPath = [...base, 'authentication', 'md5', 'key-id', keyId]
          ops.push({ op: 'set', path: keyPath })
          const key = values.md5Key.trim()
          if (key) ops.push({ op: 'set', path: [...keyPath, 'md5-key'], value: key })
        }
      } else if (values.authMode === 'null') {
        ops.push({ op: 'set', path: [...base, 'authentication', 'null'] })
      }
    } else if (values.authMode === 'plaintext-password') {
      const password = values.plaintextPassword.trim()
      if (password) {
        ops.push({ op: 'set', path: [...base, 'authentication', 'plaintext-password'], value: password })
      }
    } else if (values.authMode === 'md5') {
      const key = values.md5Key.trim()
      if (key) {
        const keyId = values.md5KeyId.trim()
        ops.push({
          op: 'set',
          path: [...base, 'authentication', 'md5', 'key-id', keyId, 'md5-key'],
          value: key,
        })
      }
    }
  }

  return ops
}

export function deleteInterfaceOp(protocol: OSPFProtocol, name: string): ConfigOp {
  return { op: 'delete', path: ospfInterfacePath(protocol, name) }
}
