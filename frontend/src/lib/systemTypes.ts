/**
 * Typed, UI-friendly shapes for a "broader v1" slice of `system` -
 * see systemParse.ts for the (pure, unit-tested) functions that
 * convert the raw VyOS JSON tree (as returned by GET
 * /api/config/tree?path=system) into these shapes, and back into
 * ConfigOp path arrays for the pending-changes cart.
 *
 * `system` covers a lot in real VyOS (confirmed against docs.vyos.io
 * and, for `system login user`, vyos-1x's own interface-definition
 * XML source directly - `interface-definitions/system_login.xml.in`,
 * which turned out to have drifted from the prose docs for
 * `system syslog local`: the current schema has `local` as a
 * *singular* node (facility/level rules only), not a tagNode keyed by
 * filename as the prose page still shows). Scoped per explicit
 * product decision to a "broader v1" covering three areas:
 *
 * 1. General identity/DNS/time settings (host-name, domain-name,
 *    domain-search, name-server, static-host-mapping, time-zone) -
 *    SystemGeneralSettings + StaticHostMapping.
 * 2. Local user account management (`system login user`) - real
 *    synergy with AUTH_MODE=vyos-users (see security.md), since those
 *    are the exact accounts that can log into this app. Covers
 *    full-name, password (write-only, like every other masked
 *    credential), the disable flag, and SSH public keys - SystemUser
 *    + SystemUserPublicKey. Deliberately excludes OTP-based MFA,
 *    RADIUS/TACACS+ remote authentication, login banners, session
 *    limits, SSH certificate principals, and operator groups - all
 *    Config-Tree-only for now.
 * 3. Basic syslog (`system syslog`) - local and remote logging, each
 *    as a set of facility/level rules - SystemSyslogConfig +
 *    SyslogFacilityRule + SyslogRemoteHost. Deliberately excludes
 *    TLS-encrypted remote logging (ties into PKI, which doesn't exist
 *    in this app yet), console logging, global settings (marker
 *    messages, preserve-fqdn), and remote logging's
 *    format/source-address/vrf options.
 *
 * Note on SSH public keys and masking: `authentication public-keys
 * <id> key <value>` matches shared/sensitive-fields.json's generic
 * "key" entry, so this app masks it server-side - even though an SSH
 * *public* key isn't actually secret. This is the accepted,
 * documented trade-off in that file's own doc comment ("safe, if
 * mildly inconvenient, to mask a value that isn't actually secret")
 * rather than a bug to fix (contrast with the OSPF `md5-key` gap,
 * which really was an unmasked secret and got its own fix). So
 * SystemUserPublicKey's `key` is write-only, same convention as every
 * other masked leaf in this app.
 */

export interface SystemGeneralSettings {
  hostName?: string
  domainName?: string
  domainSearch: string[]
  nameServers: string[]
  timeZone?: string
}

export function blankGeneralSettings(): SystemGeneralSettings {
  return { domainSearch: [], nameServers: [] }
}

export interface StaticHostMapping {
  hostName: string
  addresses: string[]
  aliases: string[]
}

export interface SystemUserPublicKey {
  /** The tag-node identifier - conventionally `user@host`, but VyOS
   * doesn't require any particular format. */
  identifier: string
  type?: string
  options?: string
  /** Write-only - see this file's doc comment on SSH key masking. */
  hasKey: boolean
}

export const SSH_KEY_TYPES = [
  'ssh-ed25519',
  'ssh-rsa',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'ssh-dss',
]

export interface SystemUser {
  username: string
  fullName?: string
  disabled: boolean
  /** Whether `authentication encrypted-password` is present in the
   * tree - i.e. a real password hash exists (either VyOS's own
   * commit-time hashing of a plaintext-password this app previously
   * sent, or one set directly). Write-only, like every other masked
   * credential - see BGPPeer.hasPassword's doc comment for the
   * general convention. */
  hasPassword: boolean
  publicKeys: SystemUserPublicKey[]
}

export const SYSLOG_FACILITIES = [
  'all',
  'auth',
  'authpriv',
  'cron',
  'daemon',
  'kern',
  'lpr',
  'mail',
  'mark',
  'news',
  'syslog',
  'user',
  'uucp',
  'local0',
  'local1',
  'local2',
  'local3',
  'local4',
  'local5',
  'local6',
  'local7',
] as const

export const SYSLOG_LEVELS = [
  'all',
  'emerg',
  'alert',
  'crit',
  'err',
  'warning',
  'notice',
  'info',
  'debug',
] as const

export interface SyslogFacilityRule {
  facility: string
  /** Defaults to 'err' in VyOS if unset - kept optional here since an
   * explicitly-configured value vs. the implied default are still
   * distinguishable in the raw tree. */
  level?: string
}

export interface SyslogRemoteHost {
  address: string
  facilities: SyslogFacilityRule[]
  protocol?: 'tcp' | 'udp'
  port?: string
}

export interface SystemSyslogConfig {
  local: SyslogFacilityRule[]
  remote: SyslogRemoteHost[]
}

export function blankSyslogConfig(): SystemSyslogConfig {
  return { local: [], remote: [] }
}

export interface SystemConfig {
  general: SystemGeneralSettings
  staticHostMappings: StaticHostMapping[]
  users: SystemUser[]
  syslog: SystemSyslogConfig
}
