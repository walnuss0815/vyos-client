import { bgpPeerPath } from './bgpParse'
import type { BGPAddressFamilySettings, BGPPeer, BGPPeerKind } from './bgpTypes'
import type { ConfigOp } from './vyosApi'

export interface BGPAddressFamilyFormValues {
  nexthopSelf: boolean
  removePrivateAs: boolean
  softReconfigurationInbound: boolean
  maximumPrefix: string
}

export interface BGPPeerFormValues {
  remoteAs: string
  description: string
  /** Write-only: '' means "leave unchanged", matching TreeNode's
   * masked-leaf convention - the real current value is never known
   * client-side (see bgpTypes.ts's BGPPeer.hasPassword doc comment),
   * so there's no "before" state to diff against. A non-empty value
   * always queues a fresh `set`, regardless of hasPassword; removing
   * a password entirely is a separate, explicit action in the UI
   * (BGPPeerForm.tsx), not part of this diffed form. */
  password: string
  shutdown: boolean
  passive: boolean
  ebgpMultihop: string
  updateSource: string
  /** Neighbors only - blank (and never shown/edited) for peer-groups,
   * which can't be assigned to another peer-group. */
  peerGroup: string
  ipv4Unicast: BGPAddressFamilyFormValues
  ipv6Unicast: BGPAddressFamilyFormValues
}

function blankAddressFamilyFormValues(): BGPAddressFamilyFormValues {
  return {
    nexthopSelf: false,
    removePrivateAs: false,
    softReconfigurationInbound: false,
    maximumPrefix: '',
  }
}

export function blankPeerFormValues(): BGPPeerFormValues {
  return {
    remoteAs: '',
    description: '',
    password: '',
    shutdown: false,
    passive: false,
    ebgpMultihop: '',
    updateSource: '',
    peerGroup: '',
    ipv4Unicast: blankAddressFamilyFormValues(),
    ipv6Unicast: blankAddressFamilyFormValues(),
  }
}

function addressFamilyToFormValues(af: BGPAddressFamilySettings): BGPAddressFamilyFormValues {
  return {
    nexthopSelf: af.nexthopSelf,
    removePrivateAs: af.removePrivateAs,
    softReconfigurationInbound: af.softReconfigurationInbound,
    maximumPrefix: af.maximumPrefix ?? '',
  }
}

export function peerToFormValues(peer: BGPPeer): BGPPeerFormValues {
  return {
    remoteAs: peer.remoteAs ?? '',
    description: peer.description ?? '',
    password: '',
    shutdown: peer.shutdown,
    passive: peer.passive,
    ebgpMultihop: peer.ebgpMultihop ?? '',
    updateSource: peer.updateSource ?? '',
    peerGroup: peer.peerGroup ?? '',
    ipv4Unicast: addressFamilyToFormValues(peer.ipv4Unicast),
    ipv6Unicast: addressFamilyToFormValues(peer.ipv6Unicast),
  }
}

interface ScalarField {
  get: (v: BGPPeerFormValues) => string
  segments: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.remoteAs, segments: ['remote-as'] },
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.ebgpMultihop, segments: ['ebgp-multihop'] },
  { get: (v) => v.updateSource, segments: ['update-source'] },
  { get: (v) => v.peerGroup, segments: ['peer-group'] },
  { get: (v) => v.ipv4Unicast.maximumPrefix, segments: ['address-family', 'ipv4-unicast', 'maximum-prefix'] },
  { get: (v) => v.ipv6Unicast.maximumPrefix, segments: ['address-family', 'ipv6-unicast', 'maximum-prefix'] },
]

interface FlagField {
  get: (v: BGPPeerFormValues) => boolean
  segments: string[]
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.shutdown, segments: ['shutdown'] },
  { get: (v) => v.passive, segments: ['passive'] },
  { get: (v) => v.ipv4Unicast.nexthopSelf, segments: ['address-family', 'ipv4-unicast', 'nexthop-self'] },
  {
    get: (v) => v.ipv4Unicast.removePrivateAs,
    segments: ['address-family', 'ipv4-unicast', 'remove-private-as'],
  },
  {
    get: (v) => v.ipv4Unicast.softReconfigurationInbound,
    segments: ['address-family', 'ipv4-unicast', 'soft-reconfiguration', 'inbound'],
  },
  { get: (v) => v.ipv6Unicast.nexthopSelf, segments: ['address-family', 'ipv6-unicast', 'nexthop-self'] },
  {
    get: (v) => v.ipv6Unicast.removePrivateAs,
    segments: ['address-family', 'ipv6-unicast', 'remove-private-as'],
  },
  {
    get: (v) => v.ipv6Unicast.softReconfigurationInbound,
    segments: ['address-family', 'ipv6-unicast', 'soft-reconfiguration', 'inbound'],
  },
]

/**
 * Diffs `before` (the peer as last fetched from VyOS, or undefined
 * when creating a new neighbor/peer-group) against `values` (the
 * current form state) and returns only the ConfigOps needed - not a
 * full rewrite of every field. Mirrors firewallRuleForm.ts's
 * ruleFormToOps exactly, with one addition: `password` is never
 * diffed (there's no real "before" value to diff against - see
 * BGPPeerFormValues.password's doc comment) and is queued whenever
 * non-blank, independent of everything else.
 */
export function peerFormToOps(
  kind: BGPPeerKind,
  identifier: string,
  before: BGPPeer | undefined,
  values: BGPPeerFormValues,
): ConfigOp[] {
  const beforeValues = before ? peerToFormValues(before) : blankPeerFormValues()
  const ops: ConfigOp[] = []

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = bgpPeerPath(kind, identifier, ...field.segments)
    if (newValue.trim() === '') {
      ops.push({ op: 'delete', path })
    } else {
      ops.push({ op: 'set', path, value: newValue.trim() })
    }
  }

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = bgpPeerPath(kind, identifier, ...field.segments)
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const trimmedPassword = values.password.trim()
  if (trimmedPassword) {
    ops.push({ op: 'set', path: bgpPeerPath(kind, identifier, 'password'), value: trimmedPassword })
  }

  return ops
}
