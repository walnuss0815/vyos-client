import { sshDynamicProtectionPath, sshPath, sshRekeyPath } from './serviceSshParse'
import type { SSHConfig } from './serviceSshTypes'
import type { ConfigOp } from './vyosApi'

export interface SSHFormValues {
  disableHostValidation: boolean
  disablePasswordAuthentication: boolean
  fidoPinRequired: boolean
  fidoTouchRequired: boolean
  dynamicProtectionBlockTime: string
  dynamicProtectionDetectTime: string
  dynamicProtectionThreshold: string
  loglevel: string
  rekeyData: string
  rekeyTime: string
  clientKeepaliveInterval: string
  trustedUserCA: string
}

export function blankSSHFormValues(): SSHFormValues {
  return {
    disableHostValidation: false,
    disablePasswordAuthentication: false,
    fidoPinRequired: false,
    fidoTouchRequired: false,
    dynamicProtectionBlockTime: '',
    dynamicProtectionDetectTime: '',
    dynamicProtectionThreshold: '',
    loglevel: '',
    rekeyData: '',
    rekeyTime: '',
    clientKeepaliveInterval: '',
    trustedUserCA: '',
  }
}

export function sshConfigToFormValues(config: SSHConfig): SSHFormValues {
  return {
    disableHostValidation: config.disableHostValidation,
    disablePasswordAuthentication: config.disablePasswordAuthentication,
    fidoPinRequired: config.fidoPinRequired,
    fidoTouchRequired: config.fidoTouchRequired,
    dynamicProtectionBlockTime: config.dynamicProtectionBlockTime ?? '',
    dynamicProtectionDetectTime: config.dynamicProtectionDetectTime ?? '',
    dynamicProtectionThreshold: config.dynamicProtectionThreshold ?? '',
    loglevel: config.loglevel ?? '',
    rekeyData: config.rekeyData ?? '',
    rekeyTime: config.rekeyTime ?? '',
    clientKeepaliveInterval: config.clientKeepaliveInterval ?? '',
    trustedUserCA: config.trustedUserCA ?? '',
  }
}

interface FlagField {
  get: (v: SSHFormValues) => boolean
  path: string[]
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.disableHostValidation, path: sshPath('disable-host-validation') },
  { get: (v) => v.disablePasswordAuthentication, path: sshPath('disable-password-authentication') },
  { get: (v) => v.fidoPinRequired, path: sshPath('fido', 'pin-required') },
  { get: (v) => v.fidoTouchRequired, path: sshPath('fido', 'touch-required') },
]

interface ScalarField {
  get: (v: SSHFormValues) => string
  path: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.dynamicProtectionBlockTime, path: sshDynamicProtectionPath('block-time') },
  { get: (v) => v.dynamicProtectionDetectTime, path: sshDynamicProtectionPath('detect-time') },
  { get: (v) => v.dynamicProtectionThreshold, path: sshDynamicProtectionPath('threshold') },
  { get: (v) => v.loglevel, path: sshPath('loglevel') },
  { get: (v) => v.rekeyData, path: sshRekeyPath('data') },
  { get: (v) => v.rekeyTime, path: sshRekeyPath('time') },
  { get: (v) => v.clientKeepaliveInterval, path: sshPath('client-keepalive-interval') },
  { get: (v) => v.trustedUserCA, path: sshPath('trusted-user-ca') },
]

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. */
export function sshFormToOps(before: SSHConfig, values: SSHFormValues): ConfigOp[] {
  const beforeValues = sshConfigToFormValues(before)
  const ops: ConfigOp[] = []

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    ops.push(newValue ? { op: 'set', path: field.path } : { op: 'delete', path: field.path })
  }

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    if (newValue.trim() === '') ops.push({ op: 'delete', path: field.path })
    else ops.push({ op: 'set', path: field.path, value: newValue.trim() })
  }

  return ops
}

/** Enables SSH by creating the (otherwise-empty) `service ssh` node -
 * VyOS applies every leaf default once this exists. */
export function enableSSHOp(): ConfigOp {
  return { op: 'set', path: sshPath() }
}

/** Disables SSH entirely, removing every setting under `service ssh`
 * - a real risk if this is your only remote CLI access path, though
 * it doesn't affect this app's own HTTPS API access. Commit-confirm is
 * the safety net, same as everywhere else in this app. */
export function disableSSHOp(): ConfigOp {
  return { op: 'delete', path: sshPath() }
}
