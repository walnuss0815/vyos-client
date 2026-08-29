import { containerNetworkPath } from './containerParse'
import type { ContainerNetwork } from './containerTypes'
import type { ConfigOp } from './vyosApi'

export interface ContainerNetworkFormValues {
  description: string
  mtu: string
  noNameServer: boolean
  /** '' = unset (VyOS's implicit default bridge type). */
  type: '' | 'bridge' | 'macvlan'
  macvlanMode: string
  macvlanParent: string
  vrf: string
}

// Deliberately excludes gateways/prefixes (multi-valued leaves,
// managed via the generic ChipList component, same convention as
// systemGeneralForm.ts excluding domainSearch/nameServers).

export function blankContainerNetworkFormValues(): ContainerNetworkFormValues {
  return {
    description: '',
    mtu: '',
    noNameServer: false,
    type: '',
    macvlanMode: '',
    macvlanParent: '',
    vrf: '',
  }
}

export function containerNetworkToFormValues(network: ContainerNetwork): ContainerNetworkFormValues {
  return {
    description: network.description ?? '',
    mtu: network.mtu ?? '',
    noNameServer: network.noNameServer,
    type: network.type ?? '',
    macvlanMode: network.macvlan?.mode ?? '',
    macvlanParent: network.macvlan?.parent ?? '',
    vrf: network.vrf ?? '',
  }
}

interface ScalarField {
  get: (v: ContainerNetworkFormValues) => string
  segment: string
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.description, segment: 'description' },
  { get: (v) => v.mtu, segment: 'mtu' },
  { get: (v) => v.vrf, segment: 'vrf' },
]

/**
 * Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. `type` is a discriminated
 * union in the raw tree (`type bridge` is valueless, `type macvlan`
 * has its own mode/parent children) rather than a plain scalar leaf,
 * so it's diffed separately rather than via SCALAR_FIELDS.
 */
export function containerNetworkFormToOps(
  name: string,
  before: ContainerNetwork | undefined,
  values: ContainerNetworkFormValues,
): ConfigOp[] {
  const beforeValues = before ? containerNetworkToFormValues(before) : blankContainerNetworkFormValues()
  const ops: ConfigOp[] = []
  const base = containerNetworkPath(name)

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  if (beforeValues.noNameServer !== values.noNameServer) {
    const path = [...base, 'no-name-server']
    ops.push(values.noNameServer ? { op: 'set', path } : { op: 'delete', path })
  }

  const typePath = [...base, 'type']
  if (beforeValues.type !== values.type) {
    if (beforeValues.type !== '') ops.push({ op: 'delete', path: typePath })
    if (values.type === 'bridge') {
      ops.push({ op: 'set', path: [...typePath, 'bridge'] })
    } else if (values.type === 'macvlan') {
      ops.push({ op: 'set', path: [...typePath, 'macvlan'] })
      if (values.macvlanMode) {
        ops.push({ op: 'set', path: [...typePath, 'macvlan', 'mode'], value: values.macvlanMode })
      }
      if (values.macvlanParent) {
        ops.push({ op: 'set', path: [...typePath, 'macvlan', 'parent'], value: values.macvlanParent })
      }
    }
  } else if (values.type === 'macvlan') {
    // Type stayed macvlan - diff mode/parent directly, no need to
    // delete+recreate the whole discriminated union.
    if (beforeValues.macvlanMode !== values.macvlanMode) {
      const path = [...typePath, 'macvlan', 'mode']
      if (values.macvlanMode.trim() === '') ops.push({ op: 'delete', path })
      else ops.push({ op: 'set', path, value: values.macvlanMode.trim() })
    }
    if (beforeValues.macvlanParent !== values.macvlanParent) {
      const path = [...typePath, 'macvlan', 'parent']
      if (values.macvlanParent.trim() === '') ops.push({ op: 'delete', path })
      else ops.push({ op: 'set', path, value: values.macvlanParent.trim() })
    }
  }

  return ops
}

export function deleteContainerNetworkOp(name: string): ConfigOp {
  return { op: 'delete', path: containerNetworkPath(name) }
}
