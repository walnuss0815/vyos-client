/**
 * Typed, UI-friendly shape for a curated core of `service snmp`.
 * Confirmed against vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_snmp.xml.in`).
 *
 * Covers both v1/v2c (community-based) SNMP - `community`,
 * `listen-address`, `location`/`contact`/`description`, `trap-source`,
 * `trap-target`, `protocol` - and SNMPv3 (`v3` subtree): `engineid`,
 * `group`/`user`/`view` tagNodes, and v3's own richer `trap-target`
 * variant.
 *
 * Deliberately excludes `mib` (interface bandwidth-index tuning),
 * `script-extensions` (custom MIB scripts), `oid-enable`, `smux-peer`,
 * and `vrf` - all still editable via Config Tree.
 *
 * Note the naming gotcha confirmed against the XML: v1/v2c's
 * `community <name> authorization` (ro/rw) and v3's `group <name>
 * mode` (also ro/rw) are the same concept at different leaf names/
 * depths - kept as separate fields (`SNMPCommunity.authorization` vs
 * `SNMPv3Group.mode`), not collapsed into one shared type.
 *
 * v3's `auth`/`privacy` blocks (under both `user` and `trap-target`)
 * always expose an `encrypted-password`/`plaintext-password` pair in
 * VyOS's own schema - this app, like everywhere else, only ever
 * writes `plaintext-password` and treats the existence of either as a
 * write-only `hasPassword`-style boolean (see `SNMPv3AuthConfig`/
 * `SNMPv3PrivacyConfig` below), never reading back the real value.
 */

export const SNMP_AUTHORIZATION_LEVELS = ['ro', 'rw'] as const

export const SNMP_PROTOCOLS = ['udp', 'tcp'] as const

export interface SNMPCommunity {
  name: string
  /** Defaults to 'ro' in VyOS if unset. */
  authorization?: string
  clients: string[]
  networks: string[]
}

export function blankSNMPCommunity(): Omit<SNMPCommunity, 'name'> {
  return { clients: [], networks: [] }
}

export interface SNMPListenAddress {
  address: string
  /** Defaults to '161' in VyOS if unset. */
  port?: string
}

export interface SNMPTrapTarget {
  address: string
  /** Write-only, like every other masked credential in this app - see
   * SystemUser.hasPassword's doc comment for the general convention.
   * `community` matches shared/sensitive-fields.json's generic
   * "community" entry (a v1/v2c SNMP community string functions as a
   * shared secret/token, same as a password) - confirmed by testing
   * against the real backend, not assumed. */
  hasCommunity: boolean
  /** Defaults to '162' in VyOS if unset. */
  port?: string
}

export interface SNMPConfig {
  /** Whether `service snmp` exists at all in the tree. */
  enabled: boolean
  communities: SNMPCommunity[]
  contact?: string
  location?: string
  description?: string
  listenAddresses: SNMPListenAddress[]
  trapSource?: string
  trapTargets: SNMPTrapTarget[]
  /** Defaults to 'udp' in VyOS if unset. */
  protocol?: string
  v3: SNMPv3Config
}

export function blankSNMPConfig(): SNMPConfig {
  return { enabled: false, communities: [], listenAddresses: [], trapTargets: [], v3: blankSNMPv3Config() }
}

// --- SNMPv3 ----------------------------------------------------------------

export const SNMP_V3_ACCESS_MODES = ['ro', 'rw'] as const

export const SNMP_V3_SECLEVELS = ['noauth', 'auth', 'priv'] as const

export const SNMP_V3_AUTH_TYPES = ['md5', 'sha'] as const

export const SNMP_V3_PRIVACY_TYPES = ['des', 'aes'] as const

export const SNMP_V3_TRAP_TYPES = ['inform', 'trap'] as const

export interface SNMPv3Group {
  name: string
  /** Defaults to 'ro' in VyOS if unset. */
  mode?: string
  /** Defaults to 'auth' in VyOS if unset. */
  seclevel?: string
  /** References a `v3 view <name>` by name. */
  view?: string
}

export interface SNMPv3AuthConfig {
  /** Write-only - see this file's doc comment on SNMPv3 password
   * handling. */
  hasPassword: boolean
  /** Defaults to 'md5' in VyOS if unset. */
  type?: string
}

export function blankSNMPv3AuthConfig(): SNMPv3AuthConfig {
  return { hasPassword: false }
}

export interface SNMPv3PrivacyConfig {
  /** Write-only - see this file's doc comment on SNMPv3 password
   * handling. */
  hasPassword: boolean
  /** Defaults to 'des' in VyOS if unset. */
  type?: string
}

export function blankSNMPv3PrivacyConfig(): SNMPv3PrivacyConfig {
  return { hasPassword: false }
}

export interface SNMPv3User {
  name: string
  auth: SNMPv3AuthConfig
  /** References a `v3 group <name>` by name. */
  group?: string
  /** Defaults to 'ro' in VyOS if unset. */
  mode?: string
  privacy: SNMPv3PrivacyConfig
}

export function blankSNMPv3User(): Omit<SNMPv3User, 'name'> {
  return { auth: blankSNMPv3AuthConfig(), privacy: blankSNMPv3PrivacyConfig() }
}

export interface SNMPv3ViewOid {
  oid: string
  /** VyOS's own schema shows this as a bare `<multi/>` flag with no
   * documented value shape - modeled here as a free-text multi-value
   * list, same as any other multi-valued leaf, but flagged as unusual
   * (confirmed against the XML, not empirically verified against a
   * live VyOS CLI). */
  exclude: string[]
  mask?: string
}

export function blankSNMPv3ViewOid(): Omit<SNMPv3ViewOid, 'oid'> {
  return { exclude: [] }
}

export interface SNMPv3View {
  name: string
  oids: SNMPv3ViewOid[]
}

export function blankSNMPv3View(): Omit<SNMPv3View, 'name'> {
  return { oids: [] }
}

export interface SNMPv3TrapTarget {
  address: string
  auth: SNMPv3AuthConfig
  privacy: SNMPv3PrivacyConfig
  /** Defaults to '162' in VyOS if unset. */
  port?: string
  /** Defaults to 'udp' in VyOS if unset. */
  protocol?: string
  /** Defaults to 'inform' in VyOS if unset. */
  type?: string
  /** References a `v3 user <name>` by name. */
  user?: string
}

export function blankSNMPv3TrapTarget(): Omit<SNMPv3TrapTarget, 'address'> {
  return { auth: blankSNMPv3AuthConfig(), privacy: blankSNMPv3PrivacyConfig() }
}

export interface SNMPv3Config {
  engineId?: string
  groups: SNMPv3Group[]
  users: SNMPv3User[]
  views: SNMPv3View[]
  trapTargets: SNMPv3TrapTarget[]
}

export function blankSNMPv3Config(): SNMPv3Config {
  return { groups: [], users: [], views: [], trapTargets: [] }
}
