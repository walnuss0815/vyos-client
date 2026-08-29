import { dynamicDnsEntryPath, dynamicDnsPath } from './serviceDnsDynamicParse'
import type { DynamicDNSEntry } from './serviceDnsDynamicTypes'
import type { ConfigOp } from './vyosApi'

export interface DynamicDNSEntryFormValues {
  description: string
  protocol: string
  /** '' = neither configured. */
  addressMode: '' | 'interface' | 'web'
  addressInterface: string
  addressWebUrl: string
  addressWebSkip: string
  ipVersion: string
  server: string
  zone: string
  username: string
  /** Write-only, like SystemUserFormValues.password - see that type's
   * doc comment for the general convention. */
  password: string
  key: string
  ttl: string
  waitTime: string
  expiryTime: string
}

export function blankDynamicDNSEntryFormValues(): DynamicDNSEntryFormValues {
  return {
    description: '',
    protocol: '',
    addressMode: '',
    addressInterface: '',
    addressWebUrl: '',
    addressWebSkip: '',
    ipVersion: '',
    server: '',
    zone: '',
    username: '',
    password: '',
    key: '',
    ttl: '',
    waitTime: '',
    expiryTime: '',
  }
}

export function dynamicDNSEntryToFormValues(entry: DynamicDNSEntry): DynamicDNSEntryFormValues {
  return {
    description: entry.description ?? '',
    protocol: entry.protocol ?? '',
    addressMode: entry.addressMode ?? '',
    addressInterface: entry.addressInterface ?? '',
    addressWebUrl: entry.addressWebUrl ?? '',
    addressWebSkip: entry.addressWebSkip ?? '',
    ipVersion: entry.ipVersion ?? '',
    server: entry.server ?? '',
    zone: entry.zone ?? '',
    username: entry.username ?? '',
    password: '',
    key: entry.key ?? '',
    ttl: entry.ttl ?? '',
    waitTime: entry.waitTime ?? '',
    expiryTime: entry.expiryTime ?? '',
  }
}

interface ScalarField {
  get: (v: DynamicDNSEntryFormValues) => string
  segments: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.protocol, segments: ['protocol'] },
  { get: (v) => v.ipVersion, segments: ['ip-version'] },
  { get: (v) => v.server, segments: ['server'] },
  { get: (v) => v.zone, segments: ['zone'] },
  { get: (v) => v.username, segments: ['username'] },
  { get: (v) => v.key, segments: ['key'] },
  { get: (v) => v.ttl, segments: ['ttl'] },
  { get: (v) => v.waitTime, segments: ['wait-time'] },
  { get: (v) => v.expiryTime, segments: ['expiry-time'] },
]

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps, plus the write-only
 * password handling from systemUserForm.ts's userFormToOps and the
 * discriminated-union handling from containerNetworkForm.ts's `type`
 * diffing (for `addressMode`). */
export function dynamicDNSEntryFormToOps(
  name: string,
  before: DynamicDNSEntry | undefined,
  values: DynamicDNSEntryFormValues,
): ConfigOp[] {
  const beforeValues = before ? dynamicDNSEntryToFormValues(before) : blankDynamicDNSEntryFormValues()
  const ops: ConfigOp[] = []
  const base = dynamicDnsEntryPath(name)

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  const addressPath = [...base, 'address']
  const addressChanged =
    beforeValues.addressMode !== values.addressMode ||
    (values.addressMode === 'interface' && beforeValues.addressInterface !== values.addressInterface) ||
    (values.addressMode === 'web' &&
      (beforeValues.addressWebUrl !== values.addressWebUrl ||
        beforeValues.addressWebSkip !== values.addressWebSkip))

  if (addressChanged) {
    if (beforeValues.addressMode !== '') ops.push({ op: 'delete', path: addressPath })
    if (values.addressMode === 'interface' && values.addressInterface) {
      ops.push({ op: 'set', path: [...addressPath, 'interface'], value: values.addressInterface })
    } else if (values.addressMode === 'web') {
      if (values.addressWebUrl) ops.push({ op: 'set', path: [...addressPath, 'web', 'url'], value: values.addressWebUrl })
      if (values.addressWebSkip) ops.push({ op: 'set', path: [...addressPath, 'web', 'skip'], value: values.addressWebSkip })
    }
  }

  const trimmedPassword = values.password.trim()
  if (trimmedPassword) {
    ops.push({ op: 'set', path: [...base, 'password'], value: trimmedPassword })
  }

  return ops
}

export function deleteDynamicDNSEntryOp(name: string): ConfigOp {
  return { op: 'delete', path: dynamicDnsEntryPath(name) }
}

export interface DynamicDNSGlobalFormValues {
  interval: string
  vrf: string
}

export function blankDynamicDNSGlobalFormValues(): DynamicDNSGlobalFormValues {
  return { interval: '', vrf: '' }
}

export function dynamicDNSGlobalToFormValues(config: {
  interval?: string
  vrf?: string
}): DynamicDNSGlobalFormValues {
  return { interval: config.interval ?? '', vrf: config.vrf ?? '' }
}

export function dynamicDNSGlobalFormToOps(
  before: { interval?: string; vrf?: string },
  values: DynamicDNSGlobalFormValues,
): ConfigOp[] {
  const beforeValues = dynamicDNSGlobalToFormValues(before)
  const ops: ConfigOp[] = []

  const fields: { get: (v: DynamicDNSGlobalFormValues) => string; segment: string }[] = [
    { get: (v) => v.interval, segment: 'interval' },
    { get: (v) => v.vrf, segment: 'vrf' },
  ]
  for (const field of fields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = dynamicDnsPath(field.segment)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}
