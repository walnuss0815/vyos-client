import {
  blankAccelPppClientIpPool,
  blankAccelPppClientIpv6Pool,
  blankAccelPppConfig,
  blankAccelPppLocalUser,
  blankAccelPppPppOptions,
  blankAccelPppRadius,
  blankL2tpIpsecSettings,
  blankL2tpLns,
  blankSstpSsl,
  type AccelPppClientIpPool,
  type AccelPppClientIpv6Pool,
  type AccelPppClientIpv6PoolPrefix,
  type AccelPppConfig,
  type AccelPppExtendedScripts,
  type AccelPppKind,
  type AccelPppLimits,
  type AccelPppLocalUser,
  type AccelPppPppOptions,
  type AccelPppRadius,
  type AccelPppRadiusServer,
  type L2tpIpsecSettings,
  type L2tpLns,
  type SstpSsl,
} from './vpnAccelPppTypes'

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

// --- authentication --------------------------------------------------------

function parseLocalUser(username: string, raw: unknown): AccelPppLocalUser {
  return {
    username,
    ...blankAccelPppLocalUser(),
    disabled: isFlagPresent(raw, 'disable'),
    hasPassword: child(raw, 'password') !== undefined,
    staticIp: asString(child(raw, 'static-ip')),
    rateLimitUpload: asString(child(child(raw, 'rate-limit'), 'upload')),
    rateLimitDownload: asString(child(child(raw, 'rate-limit'), 'download')),
  }
}

function parseRadiusServer(address: string, raw: unknown): AccelPppRadiusServer {
  return {
    address,
    hasKey: child(raw, 'key') !== undefined,
    port: asString(child(raw, 'port')),
  }
}

function parseRadius(raw: unknown): AccelPppRadius {
  const root = child(raw, 'radius')
  if (root === undefined) return blankAccelPppRadius()
  return {
    mode: undefined,
    servers: entries(child(root, 'server'))
      .map(([address, serverRaw]) => parseRadiusServer(address, serverRaw))
      .sort((a, b) => a.address.localeCompare(b.address)),
    accountingInterimInterval: asString(child(root, 'accounting-interim-interval')),
    timeout: asString(child(root, 'timeout')),
    nasIdentifier: asString(child(root, 'nas-identifier')),
  }
}

function parseAuthentication(raw: unknown) {
  const root = child(raw, 'authentication')
  return {
    mode: asString(child(root, 'mode')),
    protocols: asStringArray(child(root, 'protocols')),
    localUsers: entries(child(child(root, 'local-users'), 'username'))
      .map(([username, userRaw]) => parseLocalUser(username, userRaw))
      .sort((a, b) => a.username.localeCompare(b.username)),
    radius: parseRadius(root),
  }
}

// --- client ip pools --------------------------------------------------------

function parseClientIpPool(name: string, raw: unknown): AccelPppClientIpPool {
  return {
    name,
    ...blankAccelPppClientIpPool(),
    ranges: asStringArray(child(raw, 'range')),
    nextPool: asString(child(raw, 'next-pool')),
  }
}

function parsePrefix(raw: unknown): AccelPppClientIpv6PoolPrefix {
  return { prefix: asString(child(raw, 'prefix')) ?? '', mask: asString(child(raw, 'mask')) }
}

function parseClientIpv6Pool(name: string, raw: unknown): AccelPppClientIpv6Pool {
  return {
    name,
    ...blankAccelPppClientIpv6Pool(),
    prefixes: entries(child(raw, 'prefix')).map(([prefix, prefRaw]) =>
      parsePrefix({ prefix, ...(isRecord(prefRaw) ? prefRaw : {}) }),
    ),
  }
}

// --- ppp-options / limits / extended-scripts --------------------------------

function parsePppOptions(raw: unknown): AccelPppPppOptions {
  const root = child(raw, 'ppp-options')
  if (root === undefined) return blankAccelPppPppOptions()
  return {
    minMtu: asString(child(root, 'min-mtu')),
    mru: asString(child(root, 'mru')),
    disableCcp: isFlagPresent(root, 'disable-ccp'),
    mppe: asString(child(root, 'mppe')),
    lcpEchoInterval: asString(child(root, 'lcp-echo-interval')),
    lcpEchoFailure: asString(child(root, 'lcp-echo-failure')),
    lcpEchoTimeout: asString(child(root, 'lcp-echo-timeout')),
    ipv4: asString(child(root, 'ipv4')),
    ipv6: asString(child(root, 'ipv6')),
  }
}

function parseLimits(raw: unknown): AccelPppLimits {
  const root = child(raw, 'limits')
  return {
    connectionLimit: asString(child(root, 'connection-limit')),
    burst: asString(child(root, 'burst')),
    timeout: asString(child(root, 'timeout')),
  }
}

function parseExtendedScripts(raw: unknown): AccelPppExtendedScripts {
  const root = child(raw, 'extended-scripts')
  return {
    onPreUp: asString(child(root, 'on-pre-up')),
    onUp: asString(child(root, 'on-up')),
    onDown: asString(child(root, 'on-down')),
    onChange: asString(child(root, 'on-change')),
  }
}

// --- L2TP-only sub-sections --------------------------------------------------

function parseL2tpIpsecSettings(raw: unknown): L2tpIpsecSettings {
  const root = child(raw, 'ipsec-settings')
  if (root === undefined) return blankL2tpIpsecSettings()
  const auth = child(root, 'authentication')
  return {
    authMode: asString(child(auth, 'mode')),
    hasPresharedSecret: child(auth, 'pre-shared-secret') !== undefined,
    ikeLifetime: asString(child(root, 'ike-lifetime')),
    lifetime: asString(child(root, 'lifetime')),
  }
}

function parseL2tpLns(raw: unknown): L2tpLns {
  const root = child(raw, 'lns')
  if (root === undefined) return blankL2tpLns()
  return {
    hasSharedSecret: child(root, 'shared-secret') !== undefined,
    hostName: asString(child(root, 'host-name')),
  }
}

// --- SSTP-only sub-sections --------------------------------------------------

function parseSstpSsl(raw: unknown): SstpSsl {
  const root = child(raw, 'ssl')
  if (root === undefined) return blankSstpSsl()
  return {
    caCertificate: asString(child(root, 'ca-certificate')),
    certificate: asString(child(root, 'certificate')),
  }
}

// --- top level ---------------------------------------------------------------

export function parseAccelPppConfig(kind: AccelPppKind, top: unknown): AccelPppConfig {
  if (top === undefined) return blankAccelPppConfig()
  // L2TP and PPTP wrap everything under `remote-access`; SSTP does not.
  const root = kind === 'sstp' ? top : child(top, 'remote-access')
  if (root === undefined) return blankAccelPppConfig()

  return {
    enabled: true,
    description: asString(child(root, 'description')),
    authentication: parseAuthentication(root),
    clientIpPools: entries(child(root, 'client-ip-pool'))
      .map(([name, raw]) => parseClientIpPool(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    clientIpv6Pools: entries(child(root, 'client-ipv6-pool'))
      .map(([name, raw]) => parseClientIpv6Pool(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    defaultPool: asString(child(root, 'default-pool')),
    defaultIpv6Pool: asString(child(root, 'default-ipv6-pool')),
    extendedScripts: parseExtendedScripts(root),
    gatewayAddress: asString(child(root, 'gateway-address')),
    limits: parseLimits(root),
    maxConcurrentSessions: asString(child(root, 'max-concurrent-sessions')),
    mtu: asString(child(root, 'mtu')),
    nameServers: asStringArray(child(root, 'name-server')),
    pppOptions: parsePppOptions(root),
    shaperFwmark: asString(child(child(root, 'shaper'), 'fwmark')),
    snmpMasterAgent: isFlagPresent(child(root, 'snmp'), 'master-agent'),
    threadCount: asString(child(root, 'thread-count')),
    winsServers: asStringArray(child(root, 'wins-server')),
    logLevel: asString(child(child(root, 'log'), 'level')),
    outsideAddress: kind === 'sstp' ? undefined : asString(child(root, 'outside-address')),
    ipsecSettings: kind === 'l2tp' ? parseL2tpIpsecSettings(root) : blankL2tpIpsecSettings(),
    lns: kind === 'l2tp' ? parseL2tpLns(root) : blankL2tpLns(),
    ssl: kind === 'sstp' ? parseSstpSsl(root) : blankSstpSsl(),
    port: kind === 'sstp' ? asString(child(root, 'port')) : undefined,
    hostName: kind === 'sstp' ? asString(child(root, 'host-name')) : undefined,
  }
}

// --- path builders -----------------------------------------------------------

/** Root of the entire protocol's config, e.g. `vpn l2tp`. */
export function accelPppKindPath(kind: AccelPppKind, ...rest: string[]): string[] {
  return ['vpn', kind, ...rest]
}

/** Root of the field set common to L2TP/PPTP/SSTP - accounts for the
 * `remote-access` wrapper on L2TP/PPTP that SSTP lacks. */
export function accelPppBasePath(kind: AccelPppKind, ...rest: string[]): string[] {
  return kind === 'sstp' ? accelPppKindPath(kind, ...rest) : accelPppKindPath(kind, 'remote-access', ...rest)
}

export function accelPppAuthPath(kind: AccelPppKind, ...rest: string[]): string[] {
  return accelPppBasePath(kind, 'authentication', ...rest)
}

export function accelPppLocalUserPath(kind: AccelPppKind, username: string, ...rest: string[]): string[] {
  return accelPppAuthPath(kind, 'local-users', 'username', username, ...rest)
}

export function accelPppRadiusServerPath(kind: AccelPppKind, address: string, ...rest: string[]): string[] {
  return accelPppAuthPath(kind, 'radius', 'server', address, ...rest)
}

export function accelPppClientIpPoolPath(kind: AccelPppKind, name: string, ...rest: string[]): string[] {
  return accelPppBasePath(kind, 'client-ip-pool', name, ...rest)
}

export function accelPppClientIpv6PoolPath(kind: AccelPppKind, name: string, ...rest: string[]): string[] {
  return accelPppBasePath(kind, 'client-ipv6-pool', name, ...rest)
}

export function accelPppClientIpv6PoolPrefixPath(
  kind: AccelPppKind,
  name: string,
  prefix: string,
  ...rest: string[]
): string[] {
  return accelPppClientIpv6PoolPath(kind, name, 'prefix', prefix, ...rest)
}

export function accelPppPppOptionsPath(kind: AccelPppKind, ...rest: string[]): string[] {
  return accelPppBasePath(kind, 'ppp-options', ...rest)
}

export function accelPppLimitsPath(kind: AccelPppKind, ...rest: string[]): string[] {
  return accelPppBasePath(kind, 'limits', ...rest)
}

export function accelPppExtendedScriptsPath(kind: AccelPppKind, ...rest: string[]): string[] {
  return accelPppBasePath(kind, 'extended-scripts', ...rest)
}

/** L2TP only. */
export function l2tpIpsecSettingsPath(...rest: string[]): string[] {
  return accelPppBasePath('l2tp', 'ipsec-settings', ...rest)
}

/** L2TP only - `ipsec-settings authentication ...`. */
export function l2tpIpsecAuthPath(...rest: string[]): string[] {
  return l2tpIpsecSettingsPath('authentication', ...rest)
}

/** L2TP only. */
export function l2tpLnsPath(...rest: string[]): string[] {
  return accelPppBasePath('l2tp', 'lns', ...rest)
}

/** SSTP only. */
export function sstpSslPath(...rest: string[]): string[] {
  return accelPppBasePath('sstp', 'ssl', ...rest)
}
