import {
  accelPppAuthPath,
  accelPppBasePath,
  accelPppClientIpPoolPath,
  accelPppClientIpv6PoolPath,
  accelPppClientIpv6PoolPrefixPath,
  accelPppKindPath,
  accelPppLocalUserPath,
  accelPppRadiusServerPath,
  l2tpIpsecAuthPath,
  l2tpIpsecSettingsPath,
  l2tpLnsPath,
  sstpSslPath,
} from './vpnAccelPppParse'
import type { AccelPppConfig, AccelPppKind } from './vpnAccelPppTypes'
import type { ConfigOp } from './vyosApi'

export function enableAccelPppOp(kind: AccelPppKind): ConfigOp {
  return { op: 'set', path: accelPppKindPath(kind) }
}

export function disableAccelPppOp(kind: AccelPppKind): ConfigOp {
  return { op: 'delete', path: accelPppKindPath(kind) }
}

// --- authentication: local users -------------------------------------------

export interface AccelPppLocalUserFormOptions {
  password: string
  staticIp: string
  rateLimitUpload: string
  rateLimitDownload: string
}

export function addAccelPppLocalUserOps(
  kind: AccelPppKind,
  username: string,
  options: AccelPppLocalUserFormOptions,
): ConfigOp[] {
  const base = accelPppLocalUserPath(kind, username)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmedPassword = options.password.trim()
  if (trimmedPassword) ops.push({ op: 'set', path: [...base, 'password'], value: trimmedPassword })
  if (options.staticIp.trim()) ops.push({ op: 'set', path: [...base, 'static-ip'], value: options.staticIp.trim() })
  if (options.rateLimitUpload.trim()) {
    ops.push({ op: 'set', path: [...base, 'rate-limit', 'upload'], value: options.rateLimitUpload.trim() })
  }
  if (options.rateLimitDownload.trim()) {
    ops.push({ op: 'set', path: [...base, 'rate-limit', 'download'], value: options.rateLimitDownload.trim() })
  }
  return ops
}

export function removeAccelPppLocalUserOp(kind: AccelPppKind, username: string): ConfigOp {
  return { op: 'delete', path: accelPppLocalUserPath(kind, username) }
}

export function toggleAccelPppLocalUserDisabledOp(kind: AccelPppKind, username: string, disabled: boolean): ConfigOp {
  const path = accelPppLocalUserPath(kind, username, 'disable')
  return disabled ? { op: 'set', path } : { op: 'delete', path }
}

// --- authentication: radius servers -----------------------------------------

export function addAccelPppRadiusServerOps(kind: AccelPppKind, address: string, key: string, port: string): ConfigOp[] {
  const base = accelPppRadiusServerPath(kind, address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmedKey = key.trim()
  if (trimmedKey) ops.push({ op: 'set', path: [...base, 'key'], value: trimmedKey })
  if (port.trim()) ops.push({ op: 'set', path: [...base, 'port'], value: port.trim() })
  return ops
}

export function removeAccelPppRadiusServerOp(kind: AccelPppKind, address: string): ConfigOp {
  return { op: 'delete', path: accelPppRadiusServerPath(kind, address) }
}

// --- client IP pools ---------------------------------------------------------

export function addAccelPppClientIpPoolOps(
  kind: AccelPppKind,
  name: string,
  options: { ranges: string[]; nextPool: string },
): ConfigOp[] {
  const base = accelPppClientIpPoolPath(kind, name)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  for (const range of options.ranges) {
    ops.push({ op: 'set', path: [...base, 'range'], value: range })
  }
  if (options.nextPool.trim()) ops.push({ op: 'set', path: [...base, 'next-pool'], value: options.nextPool.trim() })
  return ops
}

export function removeAccelPppClientIpPoolOp(kind: AccelPppKind, name: string): ConfigOp {
  return { op: 'delete', path: accelPppClientIpPoolPath(kind, name) }
}

// --- client IPv6 pools --------------------------------------------------------

export function addAccelPppClientIpv6PoolOp(kind: AccelPppKind, name: string): ConfigOp {
  return { op: 'set', path: accelPppClientIpv6PoolPath(kind, name) }
}

export function removeAccelPppClientIpv6PoolOp(kind: AccelPppKind, name: string): ConfigOp {
  return { op: 'delete', path: accelPppClientIpv6PoolPath(kind, name) }
}

export function addAccelPppClientIpv6PoolPrefixOps(
  kind: AccelPppKind,
  poolName: string,
  prefix: string,
  mask: string,
): ConfigOp[] {
  const base = accelPppClientIpv6PoolPrefixPath(kind, poolName, prefix)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (mask.trim()) ops.push({ op: 'set', path: [...base, 'mask'], value: mask.trim() })
  return ops
}

export function removeAccelPppClientIpv6PoolPrefixOp(kind: AccelPppKind, poolName: string, prefix: string): ConfigOp {
  return { op: 'delete', path: accelPppClientIpv6PoolPrefixPath(kind, poolName, prefix) }
}

// --- settings (everything else, one diff-form) --------------------------------

export interface AccelPppSettingsFormValues {
  description: string
  authMode: string
  authProtocols: string[]
  defaultPool: string
  defaultIpv6Pool: string
  gatewayAddress: string
  connectionLimit: string
  burst: string
  limitsTimeout: string
  maxConcurrentSessions: string
  mtu: string
  minMtu: string
  mru: string
  disableCcp: boolean
  mppe: string
  lcpEchoInterval: string
  lcpEchoFailure: string
  lcpEchoTimeout: string
  ipv4: string
  ipv6: string
  shaperFwmark: string
  snmpMasterAgent: boolean
  threadCount: string
  logLevel: string
  onPreUp: string
  onUp: string
  onDown: string
  onChange: string
  radiusAccountingInterimInterval: string
  radiusTimeout: string
  radiusNasIdentifier: string
  // L2TP only
  outsideAddress: string
  ipsecAuthMode: string
  hasIpsecPresharedSecret: string
  ikeLifetime: string
  espLifetime: string
  hasLnsSharedSecret: string
  lnsHostName: string
  // SSTP only
  caCertificate: string
  certificate: string
  port: string
  sstpHostName: string
}

export function blankAccelPppSettingsFormValues(): AccelPppSettingsFormValues {
  return {
    description: '',
    authMode: '',
    authProtocols: [],
    defaultPool: '',
    defaultIpv6Pool: '',
    gatewayAddress: '',
    connectionLimit: '',
    burst: '',
    limitsTimeout: '',
    maxConcurrentSessions: '',
    mtu: '',
    minMtu: '',
    mru: '',
    disableCcp: false,
    mppe: '',
    lcpEchoInterval: '',
    lcpEchoFailure: '',
    lcpEchoTimeout: '',
    ipv4: '',
    ipv6: '',
    shaperFwmark: '',
    snmpMasterAgent: false,
    threadCount: '',
    logLevel: '',
    onPreUp: '',
    onUp: '',
    onDown: '',
    onChange: '',
    radiusAccountingInterimInterval: '',
    radiusTimeout: '',
    radiusNasIdentifier: '',
    outsideAddress: '',
    ipsecAuthMode: '',
    hasIpsecPresharedSecret: '',
    ikeLifetime: '',
    espLifetime: '',
    hasLnsSharedSecret: '',
    lnsHostName: '',
    caCertificate: '',
    certificate: '',
    port: '',
    sstpHostName: '',
  }
}

export function accelPppConfigToSettingsFormValues(config: AccelPppConfig): AccelPppSettingsFormValues {
  return {
    description: config.description ?? '',
    authMode: config.authentication.mode ?? '',
    authProtocols: config.authentication.protocols,
    defaultPool: config.defaultPool ?? '',
    defaultIpv6Pool: config.defaultIpv6Pool ?? '',
    gatewayAddress: config.gatewayAddress ?? '',
    connectionLimit: config.limits.connectionLimit ?? '',
    burst: config.limits.burst ?? '',
    limitsTimeout: config.limits.timeout ?? '',
    maxConcurrentSessions: config.maxConcurrentSessions ?? '',
    mtu: config.mtu ?? '',
    minMtu: config.pppOptions.minMtu ?? '',
    mru: config.pppOptions.mru ?? '',
    disableCcp: config.pppOptions.disableCcp,
    mppe: config.pppOptions.mppe ?? '',
    lcpEchoInterval: config.pppOptions.lcpEchoInterval ?? '',
    lcpEchoFailure: config.pppOptions.lcpEchoFailure ?? '',
    lcpEchoTimeout: config.pppOptions.lcpEchoTimeout ?? '',
    ipv4: config.pppOptions.ipv4 ?? '',
    ipv6: config.pppOptions.ipv6 ?? '',
    shaperFwmark: config.shaperFwmark ?? '',
    snmpMasterAgent: config.snmpMasterAgent,
    threadCount: config.threadCount ?? '',
    logLevel: config.logLevel ?? '',
    onPreUp: config.extendedScripts.onPreUp ?? '',
    onUp: config.extendedScripts.onUp ?? '',
    onDown: config.extendedScripts.onDown ?? '',
    onChange: config.extendedScripts.onChange ?? '',
    radiusAccountingInterimInterval: config.authentication.radius.accountingInterimInterval ?? '',
    radiusTimeout: config.authentication.radius.timeout ?? '',
    radiusNasIdentifier: config.authentication.radius.nasIdentifier ?? '',
    outsideAddress: config.outsideAddress ?? '',
    ipsecAuthMode: config.ipsecSettings.authMode ?? '',
    hasIpsecPresharedSecret: '',
    ikeLifetime: config.ipsecSettings.ikeLifetime ?? '',
    espLifetime: config.ipsecSettings.lifetime ?? '',
    hasLnsSharedSecret: '',
    lnsHostName: config.lns.hostName ?? '',
    caCertificate: config.ssl.caCertificate ?? '',
    certificate: config.ssl.certificate ?? '',
    port: config.port ?? '',
    sstpHostName: config.hostName ?? '',
  }
}

function stringArraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function multiSetOps(base: string[], oldValues: string[], newValues: string[]): ConfigOp[] {
  if (stringArraysEqual(oldValues, newValues)) return []
  const ops: ConfigOp[] = []
  if (newValues.length === 0) {
    ops.push({ op: 'delete', path: base })
  } else {
    for (const v of newValues) ops.push({ op: 'set', path: base, value: v })
  }
  return ops
}

export function accelPppSettingsFormToOps(
  kind: AccelPppKind,
  before: AccelPppConfig,
  values: AccelPppSettingsFormValues,
): ConfigOp[] {
  const beforeValues = accelPppConfigToSettingsFormValues(before)
  const ops: ConfigOp[] = []
  const base = accelPppBasePath(kind)
  const authBase = accelPppAuthPath(kind)
  const radiusBase = [...authBase, 'radius']
  const pppOptionsBase = [...base, 'ppp-options']
  const limitsBase = [...base, 'limits']
  const extendedScriptsBase = [...base, 'extended-scripts']

  const flagFields: { get: (v: AccelPppSettingsFormValues) => boolean; path: string[] }[] = [
    { get: (v) => v.disableCcp, path: [...pppOptionsBase, 'disable-ccp'] },
    { get: (v) => v.snmpMasterAgent, path: [...base, 'snmp', 'master-agent'] },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    ops.push(newValue ? { op: 'set', path: field.path } : { op: 'delete', path: field.path })
  }

  const scalarFields: { get: (v: AccelPppSettingsFormValues) => string; path: string[] }[] = [
    { get: (v) => v.description, path: [...base, 'description'] },
    { get: (v) => v.authMode, path: [...authBase, 'mode'] },
    { get: (v) => v.defaultPool, path: [...base, 'default-pool'] },
    { get: (v) => v.defaultIpv6Pool, path: [...base, 'default-ipv6-pool'] },
    { get: (v) => v.gatewayAddress, path: [...base, 'gateway-address'] },
    { get: (v) => v.connectionLimit, path: [...limitsBase, 'connection-limit'] },
    { get: (v) => v.burst, path: [...limitsBase, 'burst'] },
    { get: (v) => v.limitsTimeout, path: [...limitsBase, 'timeout'] },
    { get: (v) => v.maxConcurrentSessions, path: [...base, 'max-concurrent-sessions'] },
    { get: (v) => v.mtu, path: [...base, 'mtu'] },
    { get: (v) => v.minMtu, path: [...pppOptionsBase, 'min-mtu'] },
    { get: (v) => v.mru, path: [...pppOptionsBase, 'mru'] },
    { get: (v) => v.mppe, path: [...pppOptionsBase, 'mppe'] },
    { get: (v) => v.lcpEchoInterval, path: [...pppOptionsBase, 'lcp-echo-interval'] },
    { get: (v) => v.lcpEchoFailure, path: [...pppOptionsBase, 'lcp-echo-failure'] },
    { get: (v) => v.lcpEchoTimeout, path: [...pppOptionsBase, 'lcp-echo-timeout'] },
    { get: (v) => v.ipv4, path: [...pppOptionsBase, 'ipv4'] },
    { get: (v) => v.ipv6, path: [...pppOptionsBase, 'ipv6'] },
    { get: (v) => v.shaperFwmark, path: [...base, 'shaper', 'fwmark'] },
    { get: (v) => v.threadCount, path: [...base, 'thread-count'] },
    { get: (v) => v.logLevel, path: [...base, 'log', 'level'] },
    { get: (v) => v.onPreUp, path: [...extendedScriptsBase, 'on-pre-up'] },
    { get: (v) => v.onUp, path: [...extendedScriptsBase, 'on-up'] },
    { get: (v) => v.onDown, path: [...extendedScriptsBase, 'on-down'] },
    { get: (v) => v.onChange, path: [...extendedScriptsBase, 'on-change'] },
    { get: (v) => v.radiusAccountingInterimInterval, path: [...radiusBase, 'accounting-interim-interval'] },
    { get: (v) => v.radiusTimeout, path: [...radiusBase, 'timeout'] },
    { get: (v) => v.radiusNasIdentifier, path: [...radiusBase, 'nas-identifier'] },
  ]
  if (kind !== 'sstp') {
    scalarFields.push({ get: (v) => v.outsideAddress, path: [...base, 'outside-address'] })
  }
  if (kind === 'l2tp') {
    scalarFields.push(
      { get: (v) => v.ipsecAuthMode, path: [...l2tpIpsecAuthPath(), 'mode'] },
      { get: (v) => v.ikeLifetime, path: [...l2tpIpsecSettingsPath(), 'ike-lifetime'] },
      { get: (v) => v.espLifetime, path: [...l2tpIpsecSettingsPath(), 'lifetime'] },
      { get: (v) => v.lnsHostName, path: [...l2tpLnsPath(), 'host-name'] },
    )
  }
  if (kind === 'sstp') {
    scalarFields.push(
      { get: (v) => v.caCertificate, path: [...sstpSslPath(), 'ca-certificate'] },
      { get: (v) => v.certificate, path: [...sstpSslPath(), 'certificate'] },
      { get: (v) => v.port, path: [...base, 'port'] },
      { get: (v) => v.sstpHostName, path: [...base, 'host-name'] },
    )
  }
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    if (newValue.trim() === '') ops.push({ op: 'delete', path: field.path })
    else ops.push({ op: 'set', path: field.path, value: newValue.trim() })
  }

  ops.push(...multiSetOps([...authBase, 'protocols'], beforeValues.authProtocols, values.authProtocols))

  const trimmedIpsecSecret = values.hasIpsecPresharedSecret.trim()
  if (kind === 'l2tp' && trimmedIpsecSecret) {
    ops.push({ op: 'set', path: [...l2tpIpsecAuthPath(), 'pre-shared-secret'], value: trimmedIpsecSecret })
  }
  const trimmedLnsSecret = values.hasLnsSharedSecret.trim()
  if (kind === 'l2tp' && trimmedLnsSecret) {
    ops.push({ op: 'set', path: [...l2tpLnsPath(), 'shared-secret'], value: trimmedLnsSecret })
  }

  return ops
}
