import { blankSSHConfig, type SSHConfig } from './serviceSshTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/containerParse.ts's
// own copy of this comment for why this matches the rest of the codebase.)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') return [v]
  return []
}

export function parseSSHConfig(ssh: unknown): SSHConfig {
  if (ssh === undefined) return blankSSHConfig()
  const accessControl = child(ssh, 'access-control')
  const allow = child(accessControl, 'allow')
  const deny = child(accessControl, 'deny')
  const dynamicProtection = child(ssh, 'dynamic-protection')
  const fido = child(ssh, 'fido')

  return {
    enabled: true,
    allowGroups: asStringArray(child(allow, 'group')),
    allowUsers: asStringArray(child(allow, 'user')),
    denyGroups: asStringArray(child(deny, 'group')),
    denyUsers: asStringArray(child(deny, 'user')),
    ciphers: asStringArray(child(ssh, 'cipher')),
    hostkeyAlgorithms: asStringArray(child(ssh, 'hostkey-algorithm')),
    pubkeyAcceptedAlgorithms: asStringArray(child(ssh, 'pubkey-accepted-algorithm')),
    keyExchangeAlgorithms: asStringArray(child(ssh, 'key-exchange')),
    macAlgorithms: asStringArray(child(ssh, 'mac')),
    disableHostValidation: isFlagPresent(ssh, 'disable-host-validation'),
    disablePasswordAuthentication: isFlagPresent(ssh, 'disable-password-authentication'),
    fidoPinRequired: isFlagPresent(fido, 'pin-required'),
    fidoTouchRequired: isFlagPresent(fido, 'touch-required'),
    dynamicProtectionBlockTime: asString(child(dynamicProtection, 'block-time')),
    dynamicProtectionDetectTime: asString(child(dynamicProtection, 'detect-time')),
    dynamicProtectionThreshold: asString(child(dynamicProtection, 'threshold')),
    dynamicProtectionAllowFrom: asStringArray(child(dynamicProtection, 'allow-from')),
    listenAddresses: asStringArray(child(ssh, 'listen-address')),
    loglevel: asString(child(ssh, 'loglevel')),
    ports: asStringArray(child(ssh, 'port')),
    rekeyData: asString(child(child(ssh, 'rekey'), 'data')),
    rekeyTime: asString(child(child(ssh, 'rekey'), 'time')),
    clientKeepaliveInterval: asString(child(ssh, 'client-keepalive-interval')),
    trustedUserCA: asString(child(ssh, 'trusted-user-ca')),
    vrfs: asStringArray(child(ssh, 'vrf')),
  }
}

// --- path builders -----------------------------------------------------

export function sshPath(...rest: string[]): string[] {
  return ['service', 'ssh', ...rest]
}

export function sshAllowPath(...rest: string[]): string[] {
  return sshPath('access-control', 'allow', ...rest)
}

export function sshDenyPath(...rest: string[]): string[] {
  return sshPath('access-control', 'deny', ...rest)
}

export function sshDynamicProtectionPath(...rest: string[]): string[] {
  return sshPath('dynamic-protection', ...rest)
}

export function sshRekeyPath(...rest: string[]): string[] {
  return sshPath('rekey', ...rest)
}
