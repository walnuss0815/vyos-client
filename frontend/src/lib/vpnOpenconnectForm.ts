import {
  openconnectAccountingRadiusServerPath,
  openconnectAuthPath,
  openconnectAuthRadiusServerPath,
  openconnectLocalUserPath,
  openconnectNetworkSettingsPath,
  openconnectPath,
  openconnectSslPath,
} from './vpnOpenconnectParse'
import type { OpenconnectConfig } from './vpnOpenconnectTypes'
import type { ConfigOp } from './vyosApi'

export function enableOpenconnectOp(): ConfigOp {
  return { op: 'set', path: openconnectPath() }
}

export function disableOpenconnectOp(): ConfigOp {
  return { op: 'delete', path: openconnectPath() }
}

// --- accounting radius servers -------------------------------------------

export function addOpenconnectAccountingRadiusServerOps(address: string, key: string, acctPort: string): ConfigOp[] {
  const base = openconnectAccountingRadiusServerPath(address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmedKey = key.trim()
  if (trimmedKey) ops.push({ op: 'set', path: [...base, 'key'], value: trimmedKey })
  if (acctPort.trim()) ops.push({ op: 'set', path: [...base, 'acct-port'], value: acctPort.trim() })
  return ops
}

export function removeOpenconnectAccountingRadiusServerOp(address: string): ConfigOp {
  return { op: 'delete', path: openconnectAccountingRadiusServerPath(address) }
}

export function toggleOpenconnectAccountingRadiusModeOp(enabled: boolean): ConfigOp {
  const path = openconnectPath('accounting', 'mode', 'radius')
  return enabled ? { op: 'set', path } : { op: 'delete', path }
}

// --- authentication: local users -------------------------------------------

export interface OpenconnectLocalUserFormOptions {
  password: string
  otpKey: string
  otpLength: string
  otpInterval: string
  otpTokenType: string
}

export function addOpenconnectLocalUserOps(username: string, options: OpenconnectLocalUserFormOptions): ConfigOp[] {
  const base = openconnectLocalUserPath(username)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmedPassword = options.password.trim()
  if (trimmedPassword) ops.push({ op: 'set', path: [...base, 'password'], value: trimmedPassword })
  const trimmedOtpKey = options.otpKey.trim()
  if (trimmedOtpKey) ops.push({ op: 'set', path: [...base, 'otp', 'key'], value: trimmedOtpKey })
  if (options.otpLength.trim()) ops.push({ op: 'set', path: [...base, 'otp', 'otp-length'], value: options.otpLength.trim() })
  if (options.otpInterval.trim()) ops.push({ op: 'set', path: [...base, 'otp', 'interval'], value: options.otpInterval.trim() })
  if (options.otpTokenType) ops.push({ op: 'set', path: [...base, 'otp', 'token-type'], value: options.otpTokenType })
  return ops
}

export function removeOpenconnectLocalUserOp(username: string): ConfigOp {
  return { op: 'delete', path: openconnectLocalUserPath(username) }
}

export function toggleOpenconnectLocalUserDisabledOp(username: string, disabled: boolean): ConfigOp {
  const path = openconnectLocalUserPath(username, 'disable')
  return disabled ? { op: 'set', path } : { op: 'delete', path }
}

// --- authentication: radius servers -----------------------------------------

export function addOpenconnectAuthRadiusServerOps(address: string, key: string, port: string): ConfigOp[] {
  const base = openconnectAuthRadiusServerPath(address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmedKey = key.trim()
  if (trimmedKey) ops.push({ op: 'set', path: [...base, 'key'], value: trimmedKey })
  if (port.trim()) ops.push({ op: 'set', path: [...base, 'port'], value: port.trim() })
  return ops
}

export function removeOpenconnectAuthRadiusServerOp(address: string): ConfigOp {
  return { op: 'delete', path: openconnectAuthRadiusServerPath(address) }
}

// --- settings (everything else, one diff-form) --------------------------------

export interface OpenconnectSettingsFormValues {
  localAuthMode: string
  radiusAuthEnabled: boolean
  certificateUserIdentifierField: string
  radiusTimeout: string
  radiusGroupconfig: boolean
  listenAddress: string
  listenPortTcp: string
  listenPortUdp: string
  httpSecurityHeaders: boolean
  tlsVersionMin: string
  certificate: string
  hasPassphrase: string
  clientIpv4Subnet: string
  clientIpv6PoolPrefix: string
  clientIpv6PoolMask: string
  tunnelAllDns: string
  scriptConnect: string
  scriptDisconnect: string
}

export function blankOpenconnectSettingsFormValues(): OpenconnectSettingsFormValues {
  return {
    localAuthMode: '',
    radiusAuthEnabled: false,
    certificateUserIdentifierField: '',
    radiusTimeout: '',
    radiusGroupconfig: false,
    listenAddress: '',
    listenPortTcp: '',
    listenPortUdp: '',
    httpSecurityHeaders: false,
    tlsVersionMin: '',
    certificate: '',
    hasPassphrase: '',
    clientIpv4Subnet: '',
    clientIpv6PoolPrefix: '',
    clientIpv6PoolMask: '',
    tunnelAllDns: '',
    scriptConnect: '',
    scriptDisconnect: '',
  }
}

export function openconnectConfigToSettingsFormValues(config: OpenconnectConfig): OpenconnectSettingsFormValues {
  return {
    localAuthMode: config.authentication.localMode ?? '',
    radiusAuthEnabled: config.authentication.radiusEnabled,
    certificateUserIdentifierField: config.authentication.certificateUserIdentifierField ?? '',
    radiusTimeout: config.authentication.radius.timeout ?? '',
    radiusGroupconfig: config.authentication.radius.groupconfig,
    listenAddress: config.listenAddress ?? '',
    listenPortTcp: config.listenPorts.tcp ?? '',
    listenPortUdp: config.listenPorts.udp ?? '',
    httpSecurityHeaders: config.httpSecurityHeaders,
    tlsVersionMin: config.tlsVersionMin ?? '',
    certificate: config.ssl.certificate ?? '',
    hasPassphrase: '',
    clientIpv4Subnet: config.networkSettings.clientIpv4Subnet ?? '',
    clientIpv6PoolPrefix: config.networkSettings.clientIpv6Pool.prefix ?? '',
    clientIpv6PoolMask: config.networkSettings.clientIpv6Pool.mask ?? '',
    tunnelAllDns: config.networkSettings.tunnelAllDns ?? '',
    scriptConnect: config.script.connect ?? '',
    scriptDisconnect: config.script.disconnect ?? '',
  }
}

export function openconnectSettingsFormToOps(
  before: OpenconnectConfig,
  values: OpenconnectSettingsFormValues,
): ConfigOp[] {
  const beforeValues = openconnectConfigToSettingsFormValues(before)
  const ops: ConfigOp[] = []
  const authBase = openconnectAuthPath()
  const networkBase = openconnectNetworkSettingsPath()
  const sslBase = openconnectSslPath()

  const flagFields: { get: (v: OpenconnectSettingsFormValues) => boolean; path: string[] }[] = [
    { get: (v) => v.radiusAuthEnabled, path: [...authBase, 'mode', 'radius'] },
    { get: (v) => v.radiusGroupconfig, path: [...authBase, 'radius', 'groupconfig'] },
    { get: (v) => v.httpSecurityHeaders, path: openconnectPath('http-security-headers') },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    ops.push(newValue ? { op: 'set', path: field.path } : { op: 'delete', path: field.path })
  }

  const scalarFields: { get: (v: OpenconnectSettingsFormValues) => string; path: string[] }[] = [
    { get: (v) => v.localAuthMode, path: [...authBase, 'mode', 'local'] },
    { get: (v) => v.certificateUserIdentifierField, path: [...authBase, 'mode', 'certificate', 'user-identifier-field'] },
    { get: (v) => v.radiusTimeout, path: [...authBase, 'radius', 'timeout'] },
    { get: (v) => v.listenAddress, path: openconnectPath('listen-address') },
    { get: (v) => v.listenPortTcp, path: openconnectPath('listen-ports', 'tcp') },
    { get: (v) => v.listenPortUdp, path: openconnectPath('listen-ports', 'udp') },
    { get: (v) => v.tlsVersionMin, path: openconnectPath('tls-version-min') },
    { get: (v) => v.certificate, path: [...sslBase, 'certificate'] },
    { get: (v) => v.clientIpv4Subnet, path: [...networkBase, 'client-ip-settings', 'subnet'] },
    { get: (v) => v.clientIpv6PoolPrefix, path: [...networkBase, 'client-ipv6-pool', 'prefix'] },
    { get: (v) => v.clientIpv6PoolMask, path: [...networkBase, 'client-ipv6-pool', 'mask'] },
    { get: (v) => v.tunnelAllDns, path: [...networkBase, 'tunnel-all-dns'] },
    { get: (v) => v.scriptConnect, path: openconnectPath('script', 'connect') },
    { get: (v) => v.scriptDisconnect, path: openconnectPath('script', 'disconnect') },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    if (newValue.trim() === '') ops.push({ op: 'delete', path: field.path })
    else ops.push({ op: 'set', path: field.path, value: newValue.trim() })
  }

  const trimmedPassphrase = values.hasPassphrase.trim()
  if (trimmedPassphrase) ops.push({ op: 'set', path: [...sslBase, 'passphrase'], value: trimmedPassphrase })

  return ops
}
