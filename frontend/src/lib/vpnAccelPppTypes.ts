/**
 * Typed, UI-friendly shapes shared by `vpn l2tp`, `vpn pptp`, and `vpn
 * sstp` - three VyOS remote-access VPN servers all built on the same
 * underlying "accel-ppp" daemon and confirmed to share an (almost)
 * identical set of config leaves via common `#include
 * <include/accel-ppp/*.xml.i>` files. One `kind`-parametrized module
 * covers all three, the same shared-component pattern established by
 * BGP's neighbor/peer-group, OSPF/OSPFv3, and NAT's source/
 * destination areas.
 *
 * Structural differences between the three, all handled by `kind`:
 * - **L2TP and PPTP** wrap every field under a `remote-access` node
 *   (`vpn l2tp remote-access ...`) and have an `outside-address`
 *   leaf. **SSTP** has no such wrapper (`vpn sstp ...` directly) and
 *   no `outside-address`.
 * - **L2TP only** additionally has `ipsec-settings` (IPsec transport
 *   auth for the LNS) and `lns` (shared-secret/host-name sent to
 *   clients).
 * - **SSTP only** additionally has `ssl` (CA/certificate references)
 *   and `port`/`host-name` (TLS SNI matching).
 * - **PPTP** has no protocol-specific extras beyond the shared set +
 *   `outside-address` - it's the simplest of the three. Note VyOS's
 *   own schema still documents PPTP as a supported (if legacy and
 *   cryptographically weak) remote-access protocol.
 *
 * The `accel-ppp/auth-local-users.xml.i` include (used here) is a
 * *different, richer* shape than the generic top-level
 * `auth-local-users.xml.i` used elsewhere in VyOS (e.g. OpenConnect) -
 * confirmed via XML, not assumed uniform: this one adds `static-ip`
 * (default `"*"`, meaning pool-assigned) and per-user `rate-limit`
 * (upload/download kbit/s), which the generic version lacks.
 *
 * Scoped to a curated core for RADIUS, PPP options, and IPsec
 * transport settings (all noted in their own type/field doc comments
 * below) - the full schema for each is large enough that replicating
 * every leaf would be disproportionate alongside the areas already
 * covered elsewhere in this app.
 */

export type AccelPppKind = 'l2tp' | 'pptp' | 'sstp'

export const ACCEL_PPP_AUTH_MODES = ['local', 'radius', 'noauth'] as const

export const ACCEL_PPP_PROTOCOLS = ['pap', 'chap', 'mschap', 'mschap-v2'] as const

export const ACCEL_PPP_MPPE_OPTIONS = ['require', 'prefer', 'deny'] as const

export const ACCEL_PPP_IP_OPTIONS = ['deny', 'allow', 'prefer', 'require'] as const

export const ACCEL_PPP_LOG_LEVELS = ['0', '1', '2', '3', '4', '5'] as const

export interface AccelPppLocalUser {
  username: string
  disabled: boolean
  /** Write-only, like every other masked credential in this app. */
  hasPassword: boolean
  /** The literal string "*" (VyOS's own default) means "pool-assigned
   * / no static IP", not a real address - kept as a plain string, not
   * parsed as an IP. */
  staticIp?: string
  /** kbit/s. */
  rateLimitUpload?: string
  /** kbit/s. */
  rateLimitDownload?: string
}

export function blankAccelPppLocalUser(): Omit<AccelPppLocalUser, 'username'> {
  return { disabled: false, hasPassword: false }
}

export interface AccelPppClientIpPool {
  name: string
  /** IPv4 CIDR or range entries. */
  ranges: string[]
  /** Chains overflow to another named pool. */
  nextPool?: string
}

export function blankAccelPppClientIpPool(): Omit<AccelPppClientIpPool, 'name'> {
  return { ranges: [] }
}

export interface AccelPppClientIpv6PoolPrefix {
  prefix: string
  /** Prefix length handed to each client. Defaults to '64' in VyOS if
   * unset. */
  mask?: string
}

export interface AccelPppClientIpv6Pool {
  name: string
  prefixes: AccelPppClientIpv6PoolPrefix[]
}

export function blankAccelPppClientIpv6Pool(): Omit<AccelPppClientIpv6Pool, 'name'> {
  return { prefixes: [] }
}

export interface AccelPppRadiusServer {
  address: string
  /** Write-only, like every other masked credential in this app. */
  hasKey: boolean
  /** Defaults to '1812' in VyOS if unset. */
  port?: string
}

export interface AccelPppRadius {
  /** Defaults to 'local' in VyOS if unset - see ACCEL_PPP_AUTH_MODES. */
  mode?: string
  servers: AccelPppRadiusServer[]
  accountingInterimInterval?: string
  /** Defaults to '3' in VyOS if unset. */
  timeout?: string
  nasIdentifier?: string
}

export function blankAccelPppRadius(): AccelPppRadius {
  return { servers: [] }
}

export interface AccelPppAuthentication {
  /** Defaults to 'local' in VyOS if unset. */
  mode?: string
  /** Defaults to all four in VyOS if unset. */
  protocols: string[]
  localUsers: AccelPppLocalUser[]
  radius: AccelPppRadius
}

export function blankAccelPppAuthentication(): AccelPppAuthentication {
  return { protocols: [], localUsers: [], radius: blankAccelPppRadius() }
}

export interface AccelPppLimits {
  /** e.g. "1/min", "60/sec". */
  connectionLimit?: string
  burst?: string
  timeout?: string
}

export interface AccelPppPppOptions {
  minMtu?: string
  mru?: string
  disableCcp: boolean
  /** Defaults to 'prefer' in VyOS if unset. */
  mppe?: string
  lcpEchoInterval?: string
  lcpEchoFailure?: string
  lcpEchoTimeout?: string
  ipv4?: string
  /** Defaults to 'deny' in VyOS if unset. */
  ipv6?: string
}

export function blankAccelPppPppOptions(): AccelPppPppOptions {
  return { disableCcp: false }
}

export interface AccelPppExtendedScripts {
  onPreUp?: string
  onUp?: string
  onDown?: string
  onChange?: string
}

/** IPsec transport authentication for the L2TP LNS - `vpn l2tp
 * remote-access ipsec-settings`. Curated: covers the auth mode and
 * IKE/ESP lifetimes, but not the full embedded esp-group/ike-group
 * proposal definitions VyOS's schema allows nesting here (that would
 * duplicate the entire crypto-proposal shape already built for
 * `vpn ipsec` - use the global IPsec esp-group/ike-group tabs and
 * Config Tree for advanced per-protocol cipher tuning here). */
export interface L2tpIpsecSettings {
  /** 'pre-shared-secret' or 'x509'. */
  authMode?: string
  /** Write-only, like every other masked credential in this app. */
  hasPresharedSecret: boolean
  /** Defaults to '3600' in VyOS if unset. */
  ikeLifetime?: string
  /** Defaults to '3600' in VyOS if unset (ESP lifetime). */
  lifetime?: string
}

export function blankL2tpIpsecSettings(): L2tpIpsecSettings {
  return { hasPresharedSecret: false }
}

export interface L2tpLns {
  /** Write-only, like every other masked credential in this app. */
  hasSharedSecret: boolean
  hostName?: string
}

export function blankL2tpLns(): L2tpLns {
  return { hasSharedSecret: false }
}

export interface SstpSsl {
  /** References an existing `pki ca` entry by name. */
  caCertificate?: string
  /** References an existing `pki certificate` entry by name. */
  certificate?: string
}

export function blankSstpSsl(): SstpSsl {
  return {}
}

export interface AccelPppConfig {
  /** Whether the top-level node (`vpn l2tp`/`pptp`/`sstp`) exists at
   * all in the tree. */
  enabled: boolean
  description?: string
  authentication: AccelPppAuthentication
  clientIpPools: AccelPppClientIpPool[]
  clientIpv6Pools: AccelPppClientIpv6Pool[]
  defaultPool?: string
  defaultIpv6Pool?: string
  extendedScripts: AccelPppExtendedScripts
  gatewayAddress?: string
  limits: AccelPppLimits
  maxConcurrentSessions?: string
  /** Defaults to '1436' on L2TP/PPTP (accounts for tunnel overhead);
   * SSTP has no VyOS default and allows 68-1500. */
  mtu?: string
  nameServers: string[]
  pppOptions: AccelPppPppOptions
  /** Firewall mark to exclude matching traffic from shaping. */
  shaperFwmark?: string
  snmpMasterAgent: boolean
  /** 'all', 'half', or a number 1-512. Defaults to 'all' in VyOS if
   * unset. */
  threadCount?: string
  winsServers: string[]
  /** Defaults to '3' in VyOS if unset. */
  logLevel?: string
  /** L2TP and PPTP only - not present on SSTP. */
  outsideAddress?: string
  /** L2TP only. */
  ipsecSettings: L2tpIpsecSettings
  /** L2TP only. */
  lns: L2tpLns
  /** SSTP only. */
  ssl: SstpSsl
  /** SSTP only. Defaults to '443' in VyOS if unset. */
  port?: string
  /** SSTP only - only allow connections with a matching TLS SNI. */
  hostName?: string
}

export function blankAccelPppConfig(): AccelPppConfig {
  return {
    enabled: false,
    authentication: blankAccelPppAuthentication(),
    clientIpPools: [],
    clientIpv6Pools: [],
    extendedScripts: {},
    limits: {},
    nameServers: [],
    pppOptions: blankAccelPppPppOptions(),
    snmpMasterAgent: false,
    winsServers: [],
    ipsecSettings: blankL2tpIpsecSettings(),
    lns: blankL2tpLns(),
    ssl: blankSstpSsl(),
  }
}
