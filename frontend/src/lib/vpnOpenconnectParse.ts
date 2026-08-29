import {
  blankOpenconnectAccounting,
  blankOpenconnectAuthentication,
  blankOpenconnectAuthRadius,
  blankOpenconnectConfig,
  blankOpenconnectLocalUser,
  blankOpenconnectNetworkSettings,
  blankOpenconnectOtp,
  blankOpenconnectSsl,
  type OpenconnectAccounting,
  type OpenconnectAuthentication,
  type OpenconnectAuthRadius,
  type OpenconnectConfig,
  type OpenconnectListenPorts,
  type OpenconnectLocalUser,
  type OpenconnectNetworkSettings,
  type OpenconnectOtp,
  type OpenconnectRadiusServer,
  type OpenconnectScript,
  type OpenconnectSsl,
} from './vpnOpenconnectTypes'

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

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

// --- accounting ----------------------------------------------------------

function parseRadiusServer(address: string, raw: unknown): OpenconnectRadiusServer {
  return {
    address,
    disabled: isFlagPresent(raw, 'disable'),
    hasKey: child(raw, 'key') !== undefined,
    port: asString(child(raw, 'port')) ?? asString(child(raw, 'acct-port')),
  }
}

function parseAccounting(raw: unknown): OpenconnectAccounting {
  const root = child(raw, 'accounting')
  if (root === undefined) return blankOpenconnectAccounting()
  const radius = child(root, 'radius')
  return {
    radiusEnabled: isFlagPresent(child(root, 'mode'), 'radius'),
    radiusServers: entries(child(radius, 'server'))
      .map(([address, serverRaw]) => parseRadiusServer(address, serverRaw))
      .sort((a, b) => a.address.localeCompare(b.address)),
  }
}

// --- authentication --------------------------------------------------------

function parseOtp(raw: unknown): OpenconnectOtp {
  const root = child(raw, 'otp')
  if (root === undefined) return blankOpenconnectOtp()
  return {
    hasKey: child(root, 'key') !== undefined,
    otpLength: asString(child(root, 'otp-length')),
    interval: asString(child(root, 'interval')),
    tokenType: asString(child(root, 'token-type')),
  }
}

function parseLocalUser(username: string, raw: unknown): OpenconnectLocalUser {
  return {
    username,
    ...blankOpenconnectLocalUser(),
    disabled: isFlagPresent(raw, 'disable'),
    hasPassword: child(raw, 'password') !== undefined,
    otp: parseOtp(raw),
  }
}

function parseAuthRadius(raw: unknown): OpenconnectAuthRadius {
  const root = child(raw, 'radius')
  if (root === undefined) return blankOpenconnectAuthRadius()
  return {
    servers: entries(child(root, 'server'))
      .map(([address, serverRaw]) => parseRadiusServer(address, serverRaw))
      .sort((a, b) => a.address.localeCompare(b.address)),
    timeout: asString(child(root, 'timeout')),
    groupconfig: isFlagPresent(root, 'groupconfig'),
  }
}

function parseAuthentication(raw: unknown): OpenconnectAuthentication {
  const root = child(raw, 'authentication')
  if (root === undefined) return blankOpenconnectAuthentication()
  const mode = child(root, 'mode')
  return {
    localMode: asString(child(mode, 'local')),
    radiusEnabled: isFlagPresent(mode, 'radius'),
    certificateUserIdentifierField: asString(child(child(mode, 'certificate'), 'user-identifier-field')),
    groups: asStringArray(child(root, 'group')),
    localUsers: entries(child(child(root, 'local-users'), 'username'))
      .map(([username, userRaw]) => parseLocalUser(username, userRaw))
      .sort((a, b) => a.username.localeCompare(b.username)),
    radius: parseAuthRadius(root),
  }
}

// --- listen-ports / ssl -----------------------------------------------------

function parseListenPorts(raw: unknown): OpenconnectListenPorts {
  const root = child(raw, 'listen-ports')
  return { tcp: asString(child(root, 'tcp')), udp: asString(child(root, 'udp')) }
}

function parseSsl(raw: unknown): OpenconnectSsl {
  const root = child(raw, 'ssl')
  if (root === undefined) return blankOpenconnectSsl()
  return {
    caCertificates: asStringArray(child(root, 'ca-certificate')),
    certificate: asString(child(root, 'certificate')),
    hasPassphrase: child(root, 'passphrase') !== undefined,
  }
}

// --- network-settings --------------------------------------------------------

function parseNetworkSettings(raw: unknown): OpenconnectNetworkSettings {
  const root = child(raw, 'network-settings')
  if (root === undefined) return blankOpenconnectNetworkSettings()
  const pool = child(root, 'client-ipv6-pool')
  return {
    pushRoutes: asStringArray(child(root, 'push-route')),
    clientIpv4Subnet: asString(child(child(root, 'client-ip-settings'), 'subnet')),
    clientIpv6Pool: { prefix: asString(child(pool, 'prefix')), mask: asString(child(pool, 'mask')) },
    nameServers: asStringArray(child(root, 'name-server')),
    splitDns: asStringArray(child(root, 'split-dns')),
    tunnelAllDns: asString(child(root, 'tunnel-all-dns')),
  }
}

// --- script ------------------------------------------------------------------

function parseScript(raw: unknown): OpenconnectScript {
  const root = child(raw, 'script')
  return { connect: asString(child(root, 'connect')), disconnect: asString(child(root, 'disconnect')) }
}

// --- top level -----------------------------------------------------------------

export function parseOpenconnectConfig(top: unknown): OpenconnectConfig {
  if (top === undefined) return blankOpenconnectConfig()
  return {
    enabled: true,
    accounting: parseAccounting(top),
    authentication: parseAuthentication(top),
    listenAddress: asString(child(top, 'listen-address')),
    listenPorts: parseListenPorts(top),
    httpSecurityHeaders: isFlagPresent(top, 'http-security-headers'),
    tlsVersionMin: asString(child(top, 'tls-version-min')),
    ssl: parseSsl(top),
    networkSettings: parseNetworkSettings(top),
    script: parseScript(top),
  }
}

// --- path builders -----------------------------------------------------------

export function openconnectPath(...rest: string[]): string[] {
  return ['vpn', 'openconnect', ...rest]
}

export function openconnectAccountingRadiusServerPath(address: string, ...rest: string[]): string[] {
  return openconnectPath('accounting', 'radius', 'server', address, ...rest)
}

export function openconnectAuthPath(...rest: string[]): string[] {
  return openconnectPath('authentication', ...rest)
}

export function openconnectLocalUserPath(username: string, ...rest: string[]): string[] {
  return openconnectAuthPath('local-users', 'username', username, ...rest)
}

export function openconnectAuthRadiusServerPath(address: string, ...rest: string[]): string[] {
  return openconnectAuthPath('radius', 'server', address, ...rest)
}

export function openconnectSslPath(...rest: string[]): string[] {
  return openconnectPath('ssl', ...rest)
}

export function openconnectNetworkSettingsPath(...rest: string[]): string[] {
  return openconnectPath('network-settings', ...rest)
}
