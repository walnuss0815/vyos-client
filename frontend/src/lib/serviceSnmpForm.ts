import {
  snmpCommunityPath,
  snmpListenAddressPath,
  snmpPath,
  snmpTrapTargetPath,
  snmpV3GroupPath,
  snmpV3Path,
  snmpV3TrapTargetPath,
  snmpV3UserPath,
  snmpV3ViewOidPath,
  snmpV3ViewPath,
} from './serviceSnmpParse'
import type { SNMPConfig } from './serviceSnmpTypes'
import type { ConfigOp } from './vyosApi'

export interface SNMPSettingsFormValues {
  contact: string
  location: string
  description: string
  trapSource: string
  protocol: string
}

export function blankSNMPSettingsFormValues(): SNMPSettingsFormValues {
  return { contact: '', location: '', description: '', trapSource: '', protocol: '' }
}

export function snmpConfigToFormValues(config: SNMPConfig): SNMPSettingsFormValues {
  return {
    contact: config.contact ?? '',
    location: config.location ?? '',
    description: config.description ?? '',
    trapSource: config.trapSource ?? '',
    protocol: config.protocol ?? '',
  }
}

const SCALAR_FIELDS: { get: (v: SNMPSettingsFormValues) => string; segment: string }[] = [
  { get: (v) => v.contact, segment: 'contact' },
  { get: (v) => v.location, segment: 'location' },
  { get: (v) => v.description, segment: 'description' },
  { get: (v) => v.trapSource, segment: 'trap-source' },
  { get: (v) => v.protocol, segment: 'protocol' },
]

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. */
export function snmpSettingsFormToOps(before: SNMPConfig, values: SNMPSettingsFormValues): ConfigOp[] {
  const beforeValues = snmpConfigToFormValues(before)
  const ops: ConfigOp[] = []

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = snmpPath(field.segment)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function enableSNMPOp(): ConfigOp {
  return { op: 'set', path: snmpPath() }
}

export function disableSNMPOp(): ConfigOp {
  return { op: 'delete', path: snmpPath() }
}

export function addSNMPCommunityOps(name: string, authorization: string): ConfigOp[] {
  const base = snmpCommunityPath(name)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (authorization) ops.push({ op: 'set', path: [...base, 'authorization'], value: authorization })
  return ops
}

export function removeSNMPCommunityOp(name: string): ConfigOp {
  return { op: 'delete', path: snmpCommunityPath(name) }
}

export function addSNMPListenAddressOps(address: string, port: string): ConfigOp[] {
  const base = snmpListenAddressPath(address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (port.trim()) ops.push({ op: 'set', path: [...base, 'port'], value: port.trim() })
  return ops
}

export function removeSNMPListenAddressOp(address: string): ConfigOp {
  return { op: 'delete', path: snmpListenAddressPath(address) }
}

export function addSNMPTrapTargetOps(address: string, community: string, port: string): ConfigOp[] {
  const base = snmpTrapTargetPath(address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (community.trim()) ops.push({ op: 'set', path: [...base, 'community'], value: community.trim() })
  if (port.trim()) ops.push({ op: 'set', path: [...base, 'port'], value: port.trim() })
  return ops
}

export function removeSNMPTrapTargetOp(address: string): ConfigOp {
  return { op: 'delete', path: snmpTrapTargetPath(address) }
}

// --- SNMPv3 ----------------------------------------------------------------

export function snmpV3EngineIdFormToOps(before: string | undefined, value: string): ConfigOp[] {
  const beforeValue = before ?? ''
  if (beforeValue === value) return []
  const path = snmpV3Path('engineid')
  const trimmedValue = value.trim()
  if (trimmedValue === '') return [{ op: 'delete', path }]
  return [{ op: 'set', path, value: trimmedValue }]
}

export function addSNMPv3GroupOps(name: string, mode: string, seclevel: string, view: string): ConfigOp[] {
  const base = snmpV3GroupPath(name)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (mode) ops.push({ op: 'set', path: [...base, 'mode'], value: mode })
  if (seclevel) ops.push({ op: 'set', path: [...base, 'seclevel'], value: seclevel })
  if (view.trim()) ops.push({ op: 'set', path: [...base, 'view'], value: view.trim() })
  return ops
}

export function removeSNMPv3GroupOp(name: string): ConfigOp {
  return { op: 'delete', path: snmpV3GroupPath(name) }
}

export interface SNMPv3UserFormOptions {
  authPassword: string
  authType: string
  group: string
  mode: string
  privacyPassword: string
  privacyType: string
}

/** Always queues fresh auth/privacy passwords when non-blank,
 * regardless of any prior `hasPassword` state - write-only, same
 * convention as every other masked credential in this app (see
 * SystemUserFormValues.password's doc comment). */
export function addSNMPv3UserOps(name: string, options: SNMPv3UserFormOptions): ConfigOp[] {
  const base = snmpV3UserPath(name)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.group.trim()) ops.push({ op: 'set', path: [...base, 'group'], value: options.group.trim() })
  if (options.mode) ops.push({ op: 'set', path: [...base, 'mode'], value: options.mode })
  const trimmedAuthPassword = options.authPassword.trim()
  if (trimmedAuthPassword) {
    ops.push({ op: 'set', path: [...base, 'auth', 'plaintext-password'], value: trimmedAuthPassword })
  }
  if (options.authType) ops.push({ op: 'set', path: [...base, 'auth', 'type'], value: options.authType })
  const trimmedPrivacyPassword = options.privacyPassword.trim()
  if (trimmedPrivacyPassword) {
    ops.push({ op: 'set', path: [...base, 'privacy', 'plaintext-password'], value: trimmedPrivacyPassword })
  }
  if (options.privacyType) ops.push({ op: 'set', path: [...base, 'privacy', 'type'], value: options.privacyType })
  return ops
}

export function removeSNMPv3UserOp(name: string): ConfigOp {
  return { op: 'delete', path: snmpV3UserPath(name) }
}

export function addSNMPv3ViewOp(name: string): ConfigOp {
  return { op: 'set', path: snmpV3ViewPath(name) }
}

export function removeSNMPv3ViewOp(name: string): ConfigOp {
  return { op: 'delete', path: snmpV3ViewPath(name) }
}

export function addSNMPv3ViewOidOps(viewName: string, oid: string, mask: string): ConfigOp[] {
  const base = snmpV3ViewOidPath(viewName, oid)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (mask.trim()) ops.push({ op: 'set', path: [...base, 'mask'], value: mask.trim() })
  return ops
}

export function removeSNMPv3ViewOidOp(viewName: string, oid: string): ConfigOp {
  return { op: 'delete', path: snmpV3ViewOidPath(viewName, oid) }
}

export interface SNMPv3TrapTargetFormOptions {
  authPassword: string
  authType: string
  privacyPassword: string
  privacyType: string
  port: string
  protocol: string
  type: string
  user: string
}

/** Always queues fresh auth/privacy passwords when non-blank, same
 * write-only convention as addSNMPv3UserOps. */
export function addSNMPv3TrapTargetOps(address: string, options: SNMPv3TrapTargetFormOptions): ConfigOp[] {
  const base = snmpV3TrapTargetPath(address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmedAuthPassword = options.authPassword.trim()
  if (trimmedAuthPassword) {
    ops.push({ op: 'set', path: [...base, 'auth', 'plaintext-password'], value: trimmedAuthPassword })
  }
  if (options.authType) ops.push({ op: 'set', path: [...base, 'auth', 'type'], value: options.authType })
  const trimmedPrivacyPassword = options.privacyPassword.trim()
  if (trimmedPrivacyPassword) {
    ops.push({ op: 'set', path: [...base, 'privacy', 'plaintext-password'], value: trimmedPrivacyPassword })
  }
  if (options.privacyType) ops.push({ op: 'set', path: [...base, 'privacy', 'type'], value: options.privacyType })
  if (options.port.trim()) ops.push({ op: 'set', path: [...base, 'port'], value: options.port.trim() })
  if (options.protocol) ops.push({ op: 'set', path: [...base, 'protocol'], value: options.protocol })
  if (options.type) ops.push({ op: 'set', path: [...base, 'type'], value: options.type })
  if (options.user.trim()) ops.push({ op: 'set', path: [...base, 'user'], value: options.user.trim() })
  return ops
}

export function removeSNMPv3TrapTargetOp(address: string): ConfigOp {
  return { op: 'delete', path: snmpV3TrapTargetPath(address) }
}
