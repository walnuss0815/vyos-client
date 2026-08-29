/**
 * Typed, UI-friendly shapes for `vpn openconnect` - VyOS's AnyConnect-
 * compatible SSL VPN server. Unlike L2TP/PPTP/SSTP (see
 * vpnAccelPppTypes.ts), OpenConnect is not accel-ppp based and has its
 * own distinct config shape confirmed via the VyOS interface
 * definition XML, not assumed similar to the other remote-access VPN
 * protocols.
 *
 * Notable differences from the accel-ppp protocols:
 * - Its `local-users` include is the *generic* top-level
 *   `include/auth-local-users.xml.i` (just `disable`/`password`), not
 *   the richer accel-ppp variant - but OpenConnect then layers its own
 *   `otp` sub-node onto the same `local-users username <name>` tagNode
 *   for 2FA support, which no other protocol in this app has.
 * - `client-ipv6-pool` here is a *single* `prefix`/`mask` pair, not a
 *   tagNode-keyed list of named pools like L2TP/PPTP/SSTP's
 *   `client-ipv6-pool <name>`.
 * - `ssl ca-certificate` is `<multi/>` (a chain, plural) here, unlike
 *   IPsec's x509/SSTP's single CA reference.
 *
 * Scoped to a curated core - deliberately excludes
 * `authentication identity-based-config` (per-user/per-RADIUS-group
 * config file inclusion from `/config/auth` - a niche, filesystem-
 * dependent feature not modeled elsewhere in this app either).
 */

export const OPENCONNECT_LOCAL_AUTH_MODES = ['password', 'otp', 'password-otp'] as const

export const OPENCONNECT_OTP_TOKEN_TYPES = ['hotp-time', 'hotp-event'] as const

export const OPENCONNECT_TLS_VERSIONS = ['1.0', '1.1', '1.2', '1.3'] as const

export interface OpenconnectRadiusServer {
  address: string
  disabled: boolean
  /** Write-only, like every other masked credential in this app. */
  hasKey: boolean
  port?: string
}

export interface OpenconnectAccounting {
  radiusEnabled: boolean
  radiusServers: OpenconnectRadiusServer[]
}

export function blankOpenconnectAccounting(): OpenconnectAccounting {
  return { radiusEnabled: false, radiusServers: [] }
}

export interface OpenconnectOtp {
  /** Write-only, like every other masked credential in this app. */
  hasKey: boolean
  /** Defaults to '6' in VyOS if unset. */
  otpLength?: string
  /** Defaults to '30' in VyOS if unset. */
  interval?: string
  /** Defaults to 'hotp-time' in VyOS if unset. */
  tokenType?: string
}

export function blankOpenconnectOtp(): OpenconnectOtp {
  return { hasKey: false }
}

export interface OpenconnectLocalUser {
  username: string
  disabled: boolean
  /** Write-only, like every other masked credential in this app. */
  hasPassword: boolean
  otp: OpenconnectOtp
}

export function blankOpenconnectLocalUser(): Omit<OpenconnectLocalUser, 'username'> {
  return { disabled: false, hasPassword: false, otp: blankOpenconnectOtp() }
}

export interface OpenconnectAuthRadius {
  servers: OpenconnectRadiusServer[]
  /** Defaults to '3' in VyOS if unset. */
  timeout?: string
  /** If set, RADIUS fully overrides per-user config file selection. */
  groupconfig: boolean
}

export function blankOpenconnectAuthRadius(): OpenconnectAuthRadius {
  return { servers: [], groupconfig: false }
}

export interface OpenconnectAuthentication {
  /** 'password', 'otp', or 'password-otp'. */
  localMode?: string
  radiusEnabled: boolean
  certificateUserIdentifierField?: string
  /** Selectable client group names (may include a `[Friendly Name]`
   * suffix per VyOS's own help text). */
  groups: string[]
  localUsers: OpenconnectLocalUser[]
  radius: OpenconnectAuthRadius
}

export function blankOpenconnectAuthentication(): OpenconnectAuthentication {
  return { radiusEnabled: false, groups: [], localUsers: [], radius: blankOpenconnectAuthRadius() }
}

export interface OpenconnectListenPorts {
  /** Defaults to '443' in VyOS if unset. */
  tcp?: string
  /** Defaults to '443' in VyOS if unset. */
  udp?: string
}

export interface OpenconnectSsl {
  caCertificates: string[]
  /** References an existing `pki certificate` entry by name. */
  certificate?: string
  /** Write-only, like every other masked credential in this app. */
  hasPassphrase: boolean
}

export function blankOpenconnectSsl(): OpenconnectSsl {
  return { caCertificates: [], hasPassphrase: false }
}

export interface OpenconnectClientIpv6Pool {
  prefix?: string
  /** Defaults to '64' in VyOS if unset. */
  mask?: string
}

export interface OpenconnectNetworkSettings {
  pushRoutes: string[]
  clientIpv4Subnet?: string
  clientIpv6Pool: OpenconnectClientIpv6Pool
  nameServers: string[]
  splitDns: string[]
  /** 'yes' or 'no'. Defaults to 'no' in VyOS if unset. */
  tunnelAllDns?: string
}

export function blankOpenconnectNetworkSettings(): OpenconnectNetworkSettings {
  return { pushRoutes: [], clientIpv6Pool: {}, nameServers: [], splitDns: [] }
}

export interface OpenconnectScript {
  connect?: string
  disconnect?: string
}

export interface OpenconnectConfig {
  /** Whether `vpn openconnect` exists at all in the tree. */
  enabled: boolean
  accounting: OpenconnectAccounting
  authentication: OpenconnectAuthentication
  /** Defaults to '0.0.0.0' in VyOS if unset. */
  listenAddress?: string
  listenPorts: OpenconnectListenPorts
  httpSecurityHeaders: boolean
  /** Defaults to '1.2' in VyOS if unset. */
  tlsVersionMin?: string
  ssl: OpenconnectSsl
  networkSettings: OpenconnectNetworkSettings
  script: OpenconnectScript
}

export function blankOpenconnectConfig(): OpenconnectConfig {
  return {
    enabled: false,
    accounting: blankOpenconnectAccounting(),
    authentication: blankOpenconnectAuthentication(),
    listenPorts: {},
    httpSecurityHeaders: false,
    ssl: blankOpenconnectSsl(),
    networkSettings: blankOpenconnectNetworkSettings(),
    script: {},
  }
}
