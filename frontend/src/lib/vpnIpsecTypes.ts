/**
 * Typed, UI-friendly shapes for `vpn ipsec`. Confirmed against
 * vyos-1x's own interface-definition XML source
 * (`interface-definitions/vpn_ipsec.xml.in`, ~1442 lines - one of
 * VyOS's largest single config-tree areas) plus its shared
 * `#include`s.
 *
 * Covers: global authentication (`psk`/`ppk` secret stores),
 * `esp-group`/`ike-group` (crypto proposal templates), `site-to-site
 * peer` (the classic router-to-router VPN), `remote-access` (IKEv2
 * client VPN - connections, pools, RADIUS, DHCP), and `options`
 * (global settings).
 *
 * Deliberately excludes `profile <name>` (still editable via Config
 * Tree): this is DMVPN/NHRP glue (binds an esp-group/ike-group/PSK to
 * one or more tunnel interfaces for `protocols nhrp` to consume) and
 * depends on NHRP configuration, which this app doesn't cover yet -
 * out of scope until/unless DMVPN itself is built.
 *
 * Several non-obvious findings worth calling out, all confirmed
 * directly against the XML and cross-referenced with VyOS's own
 * conf_mode script and smoketest fixtures (not assumed):
 *
 * - **Site-to-site PSK authentication is NOT a field on the peer
 *   itself.** Unlike `remote-access connection` (which has a direct
 *   `authentication.pre-shared-secret` leaf), `site-to-site peer
 *   authentication` has no such leaf at all. PSK auth for site-to-site
 *   instead works by cross-referencing the *global*
 *   `authentication.psk` store: a peer's `authentication.localId`/
 *   `remoteId` (or, if unset, its `localAddress`/`remoteAddress`) must
 *   appear in some `psk <name>`'s `id` list, and that entry's secret
 *   is what actually gets used. This app models PSKs as their own
 *   standalone list (`IPsecPsk`) with an add/remove UI, entirely
 *   separate from the peer form - not a field the peer form writes.
 * - **`ppk` appears in two structurally different places**: the
 *   global `authentication.ppk <name>` (the actual secret store - id
 *   list + secret + secret-type) vs. a per-connection `ppk` reference
 *   (`{ id, required }`, just a pointer to a global ppk name, no
 *   secret) used inside both `site-to-site peer authentication` and
 *   `remote-access connection authentication`. Modeled as
 *   `IPsecPpk` (the store) and `IPsecPpkReference` (the pointer) -
 *   two distinct types.
 * - `esp-group`/`ike-group proposal <n>`'s `encryption`/`hash`/`esn`
 *   leaves are defined once via shared includes and reused
 *   identically in both places - `dh-group`/`prf` (ike-group only)
 *   and `mode`/`pfs`/`life-*` (esp-group only) are not shared.
 * - `remote-access`'s `radius` node is actually two separate
 *   same-named XML nodes VyOS's compiler merges into one - modeled
 *   here as a single flat `IPsecRemoteAccessRadius` type.
 */

export const IPSEC_SECRET_TYPES = ['plaintext', 'base64', 'hex'] as const

export interface IPsecPsk {
  /** The tagNode name - an arbitrary admin-chosen label, not
   * necessarily the peer's address (see this file's doc comment). */
  name: string
  /** IKE identities (local and/or remote, typically IP addresses)
   * this secret applies to - required by VyOS. */
  ids: string[]
  /** Write-only, like every other masked credential in this app - see
   * SystemUser.hasPassword's doc comment for the general convention. */
  hasSecret: boolean
  /** Defaults to 'plaintext' in VyOS if unset. */
  secretType?: string
  dhcpInterfaces: string[]
}

export function blankIPsecPsk(): Omit<IPsecPsk, 'name'> {
  return { ids: [], hasSecret: false, dhcpInterfaces: [] }
}

export interface IPsecPpk {
  /** The tagNode name - a global PPK label, referenced by id from
   * site-to-site/remote-access connections. */
  name: string
  ids: string[]
  /** Write-only, like `IPsecPsk.hasSecret`. */
  hasSecret: boolean
  /** Defaults to 'plaintext' in VyOS if unset. */
  secretType?: string
}

export function blankIPsecPpk(): Omit<IPsecPpk, 'name'> {
  return { ids: [], hasSecret: false }
}

/** A per-connection *reference* to a globally-defined PPK - not the
 * secret store itself (see this file's doc comment). */
export interface IPsecPpkReference {
  id?: string
  required: boolean
}

export function blankIPsecPpkReference(): IPsecPpkReference {
  return { required: false }
}

export const IPSEC_ESP_MODES = ['tunnel', 'transport'] as const

export const IPSEC_PFS_OPTIONS = [
  'enable',
  'disable',
  'dh-group1',
  'dh-group2',
  'dh-group5',
  'dh-group14',
  'dh-group15',
  'dh-group16',
  'dh-group17',
  'dh-group18',
  'dh-group19',
  'dh-group20',
  'dh-group21',
  'dh-group22',
  'dh-group23',
  'dh-group24',
  'dh-group25',
  'dh-group26',
  'dh-group27',
  'dh-group28',
  'dh-group29',
  'dh-group30',
  'dh-group31',
  'dh-group32',
  'dh-group33',
  'dh-group34',
  'dh-group35',
] as const

/** Shared by both `esp-group proposal` and `ike-group proposal` -
 * confirmed byte-identical enum/default in the XML for both. */
export const IPSEC_ENCRYPTION_CIPHERS = [
  'null',
  'aes128',
  'aes192',
  'aes256',
  'aes128ctr',
  'aes192ctr',
  'aes256ctr',
  'aes128ccm64',
  'aes192ccm64',
  'aes256ccm64',
  'aes128ccm96',
  'aes192ccm96',
  'aes256ccm96',
  'aes128ccm128',
  'aes192ccm128',
  'aes256ccm128',
  'aes128gcm64',
  'aes192gcm64',
  'aes256gcm64',
  'aes128gcm96',
  'aes192gcm96',
  'aes256gcm96',
  'aes128gcm128',
  'aes192gcm128',
  'aes256gcm128',
  'aes128gmac',
  'aes192gmac',
  'aes256gmac',
  '3des',
  'blowfish128',
  'blowfish192',
  'blowfish256',
  'camellia128',
  'camellia192',
  'camellia256',
  'camellia128ctr',
  'camellia192ctr',
  'camellia256ctr',
  'camellia128ccm64',
  'camellia192ccm64',
  'camellia256ccm64',
  'camellia128ccm96',
  'camellia192ccm96',
  'camellia256ccm96',
  'camellia128ccm128',
  'camellia192ccm128',
  'camellia256ccm128',
  'serpent128',
  'serpent192',
  'serpent256',
  'twofish128',
  'twofish192',
  'twofish256',
  'cast128',
  'chacha20poly1305',
] as const

export const IPSEC_HASH_ALGORITHMS = [
  'md5',
  'md5_128',
  'sha1',
  'sha1_160',
  'sha256',
  'sha256_96',
  'sha384',
  'sha512',
  'aesxcbc',
  'aescmac',
  'aes128gmac',
  'aes192gmac',
  'aes256gmac',
] as const

export const IPSEC_ESN_OPTIONS = ['optional', 'required', 'disabled'] as const

export const IPSEC_PRF_ALGORITHMS = [
  'prfmd5',
  'prfsha1',
  'prfaesxcbc',
  'prfaescmac',
  'prfsha256',
  'prfsha384',
  'prfsha512',
] as const

export const IPSEC_DH_GROUPS = [
  '1',
  '2',
  '5',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
] as const

export interface IPsecEspProposal {
  /** The tagNode number (proposal priority order). */
  id: string
  /** Defaults to 'aes128' in VyOS if unset. */
  encryption?: string
  /** Defaults to 'sha1' in VyOS if unset. */
  hash?: string
  /** Defaults to 'disabled' in VyOS if unset. */
  esn?: string
}

export interface IPsecEspGroup {
  name: string
  compression: boolean
  /** Defaults to '3600' in VyOS if unset. */
  lifetime?: string
  lifeBytes?: string
  lifePackets?: string
  disableRekey: boolean
  /** Defaults to 'tunnel' in VyOS if unset. */
  mode?: string
  /** Defaults to 'enable' in VyOS if unset. */
  pfs?: string
  proposals: IPsecEspProposal[]
}

export function blankIPsecEspGroup(): Omit<IPsecEspGroup, 'name'> {
  return { compression: false, disableRekey: false, proposals: [] }
}

export interface IPsecIkeProposal {
  /** The tagNode number (proposal priority order). */
  id: string
  /** No default in VyOS. */
  dhGroup?: string
  /** No default in VyOS. */
  prf?: string
  /** Defaults to 'aes128' in VyOS if unset. */
  encryption?: string
  /** Defaults to 'sha1' in VyOS if unset. */
  hash?: string
  /** Defaults to 'disabled' in VyOS if unset. */
  esn?: string
}

export const IPSEC_CLOSE_ACTIONS = ['none', 'trap', 'start'] as const

export const IPSEC_DPD_ACTIONS = ['trap', 'clear', 'restart'] as const

export const IPSEC_IKE_MODES = ['main', 'aggressive'] as const

export const IPSEC_KEY_EXCHANGE_VERSIONS = ['ikev1', 'ikev2'] as const

export interface IPsecIkeGroup {
  name: string
  /** Defaults to 'none' in VyOS if unset. */
  closeAction?: string
  /** Defaults to 'clear' in VyOS if unset. */
  dpdAction?: string
  /** Defaults to '30' in VyOS if unset. */
  dpdInterval?: string
  /** Defaults to '120' in VyOS if unset. IKEv1 only. */
  dpdTimeout?: string
  /** IKEv2 only. */
  ikev2Reauth: boolean
  /** No default in VyOS. */
  keyExchange?: string
  /** Defaults to '28800' in VyOS if unset. */
  lifetime?: string
  /** IKEv2 only. */
  disableMobike: boolean
  /** Defaults to 'main' in VyOS if unset. IKEv1 phase-1 only. */
  mode?: string
  proposals: IPsecIkeProposal[]
}

export function blankIPsecIkeGroup(): Omit<IPsecIkeGroup, 'name'> {
  return { ikev2Reauth: false, disableMobike: false, proposals: [] }
}

// --- site-to-site -----------------------------------------------------

export const IPSEC_PEER_AUTH_MODES = ['pre-shared-secret', 'rsa', 'x509'] as const

export const IPSEC_CHILDLESS_OPTIONS = ['allow', 'prefer', 'force', 'never'] as const

export const IPSEC_CONNECTION_TYPES = ['initiate', 'trap', 'none'] as const

export const IPSEC_IKEV2_REAUTH_OPTIONS = ['yes', 'no', 'inherit'] as const

export interface IPsecX509Auth {
  certificate?: string
  /** Write-only, like every other masked credential - decrypts the
   * certificate's private key. */
  hasPassphrase: boolean
  caCertificates: string[]
}

export function blankIPsecX509Auth(): IPsecX509Auth {
  return { hasPassphrase: false, caCertificates: [] }
}

export interface IPsecRsaAuth {
  /** Name of a PKI key-pair holding the local private key. */
  localKey?: string
  /** Write-only, like every other masked credential. */
  hasPassphrase: boolean
  /** Name of a PKI key-pair holding the remote public key. */
  remoteKey?: string
}

export function blankIPsecRsaAuth(): IPsecRsaAuth {
  return { hasPassphrase: false }
}

export interface IPsecPeerAuthentication {
  localId?: string
  remoteId?: string
  /** Defaults to '%any' in VyOS if unset. */
  ppk: IPsecPpkReference
  rsa: IPsecRsaAuth
  x509: IPsecX509Auth
  mode?: string
  useX509Id: boolean
}

export function blankIPsecPeerAuthentication(): IPsecPeerAuthentication {
  return { ppk: blankIPsecPpkReference(), rsa: blankIPsecRsaAuth(), x509: blankIPsecX509Auth(), useX509Id: false }
}

export interface IPsecTunnel {
  /** The tagNode number. */
  id: string
  disabled: boolean
  /** Overrides the peer's `defaultEspGroup` for this tunnel only. */
  espGroup?: string
  localPort?: string
  /** Defaults to 'dynamic' in VyOS if unset. */
  localPrefixes: string[]
  /** IP protocol name (tcp/udp/esp/gre/...). */
  protocol?: string
  priority?: string
  remotePort?: string
  /** Defaults to 'dynamic' in VyOS if unset. */
  remotePrefixes: string[]
}

export function blankIPsecTunnel(): Omit<IPsecTunnel, 'id'> {
  return { disabled: false, localPrefixes: [], remotePrefixes: [] }
}

export interface IPsecVti {
  /** VTI interface name to bind this peer to (route-based mode). */
  bind?: string
  espGroup?: string
  localPrefixes: string[]
  remotePrefixes: string[]
}

export function blankIPsecVti(): IPsecVti {
  return { localPrefixes: [], remotePrefixes: [] }
}

export interface IPsecPeer {
  /** The tagNode name - a free-form label (VyOS's own constraint
   * allows letters/digits/hyphen/underscore/`|`/`@`), not validated
   * as an IP/hostname - see this file's doc comment. */
  name: string
  disabled: boolean
  authentication: IPsecPeerAuthentication
  /** No default in VyOS. */
  childless?: string
  /** No default in VyOS. */
  connectionType?: string
  defaultEspGroup?: string
  description?: string
  dhcpInterface?: string
  forceUdpEncapsulation: boolean
  ikeGroup?: string
  /** No default in VyOS. */
  ikev2Reauth?: string
  /** ipv4, ipv6, or the literal "any". */
  localAddress?: string
  /** Multi-valued: ipv4/ipv6/hostname/"any". */
  remoteAddresses: string[]
  /** Defaults to '32' in VyOS if unset. */
  replayWindow?: string
  tunnels: IPsecTunnel[]
  virtualAddresses: string[]
  vti: IPsecVti
}

export function blankIPsecPeer(): Omit<IPsecPeer, 'name'> {
  return {
    disabled: false,
    authentication: blankIPsecPeerAuthentication(),
    forceUdpEncapsulation: false,
    remoteAddresses: [],
    tunnels: [],
    virtualAddresses: [],
    vti: blankIPsecVti(),
  }
}

// --- remote-access (IKEv2 client VPN) -----------------------------------

export const IPSEC_RA_CLIENT_MODES = ['x509', 'eap-tls', 'eap-mschapv2', 'eap-radius'] as const

export const IPSEC_RA_SERVER_MODES = ['pre-shared-secret', 'x509'] as const

export const IPSEC_RA_UNIQUE_OPTIONS = ['never', 'keep', 'replace'] as const

export interface IPsecRemoteAccessLocalUser {
  username: string
  disabled: boolean
  /** Write-only, like every other masked credential. */
  hasPassword: boolean
}

export function blankIPsecRemoteAccessLocalUser(): Omit<IPsecRemoteAccessLocalUser, 'username'> {
  return { disabled: false, hasPassword: false }
}

export interface IPsecRemoteAccessAuthentication {
  localId?: string
  x509: IPsecX509Auth
  /** Defaults to 'any' in VyOS if unset. */
  eapId?: string
  /** Defaults to 'eap-mschapv2' in VyOS if unset. */
  clientMode?: string
  localUsers: IPsecRemoteAccessLocalUser[]
  alwaysSendCert: boolean
  /** Defaults to 'x509' in VyOS if unset. */
  serverMode?: string
  ppk: IPsecPpkReference
  /** Write-only, like every other masked credential. */
  hasPreSharedSecret: boolean
}

export function blankIPsecRemoteAccessAuthentication(): IPsecRemoteAccessAuthentication {
  return {
    x509: blankIPsecX509Auth(),
    localUsers: [],
    alwaysSendCert: false,
    ppk: blankIPsecPpkReference(),
    hasPreSharedSecret: false,
  }
}

export interface IPsecRemoteAccessConnection {
  name: string
  authentication: IPsecRemoteAccessAuthentication
  /** No default in VyOS. */
  childless?: string
  description?: string
  disabled: boolean
  espGroup?: string
  ikeGroup?: string
  /** ipv4, ipv6, or the literal "any". */
  localAddress?: string
  dhcpInterface?: string
  localTrafficSelectorPort?: string
  localTrafficSelectorPrefixes: string[]
  /** Defaults to '32' in VyOS if unset. */
  replayWindow?: string
  /** VTI interface to bind this connection to. */
  bind?: string
  /** Defaults to '28800' in VyOS if unset (0 = disable inactivity
   * checks). */
  timeout?: string
  /** Pool name(s), or the literal 'dhcp'/'radius'. */
  pools: string[]
  /** No default in VyOS. */
  unique?: string
}

export function blankIPsecRemoteAccessConnection(): Omit<IPsecRemoteAccessConnection, 'name'> {
  return {
    authentication: blankIPsecRemoteAccessAuthentication(),
    disabled: false,
    localTrafficSelectorPrefixes: [],
    pools: [],
  }
}

export interface IPsecRemoteAccessPool {
  name: string
  excludePrefixes: string[]
  prefix?: string
  rangeStart?: string
  rangeStop?: string
  nameServers: string[]
}

export function blankIPsecRemoteAccessPool(): Omit<IPsecRemoteAccessPool, 'name'> {
  return { excludePrefixes: [], nameServers: [] }
}

export interface IPsecRemoteAccessRadiusServer {
  address: string
  disabled: boolean
  /** Write-only, like every other masked credential. */
  hasKey: boolean
  port?: string
  disableAccounting: boolean
}

export interface IPsecRemoteAccessRadius {
  sourceAddress?: string
  /** Defaults to '2' in VyOS if unset. */
  timeout?: string
  nasIdentifier?: string
  servers: IPsecRemoteAccessRadiusServer[]
}

export function blankIPsecRemoteAccessRadius(): IPsecRemoteAccessRadius {
  return { servers: [] }
}

export interface IPsecRemoteAccessDhcp {
  interface?: string
  server?: string
}

export interface IPsecRemoteAccess {
  connections: IPsecRemoteAccessConnection[]
  dhcp: IPsecRemoteAccessDhcp
  pools: IPsecRemoteAccessPool[]
  radius: IPsecRemoteAccessRadius
}

export function blankIPsecRemoteAccess(): IPsecRemoteAccess {
  return { connections: [], dhcp: {}, pools: [], radius: blankIPsecRemoteAccessRadius() }
}

// --- options -----------------------------------------------------------

export interface IPsecOptions {
  disableRouteAutoinstall: boolean
  /** IKEv2 only. */
  flexvpn: boolean
  interface?: string
  virtualIp: boolean
  /** Defaults to '5' in VyOS if unset. */
  retransmissionAttempts?: string
  /** Defaults to '1.8' in VyOS if unset. */
  retransmissionBase?: string
  /** Defaults to '4' in VyOS if unset. */
  retransmissionTimeout?: string
}

export function blankIPsecOptions(): IPsecOptions {
  return { disableRouteAutoinstall: false, flexvpn: false, virtualIp: false }
}

// --- top level -------------------------------------------------------------

export interface IPsecConfig {
  /** Whether `vpn ipsec` exists at all in the tree. */
  enabled: boolean
  disableUniqreqids: boolean
  psks: IPsecPsk[]
  ppks: IPsecPpk[]
  espGroups: IPsecEspGroup[]
  ikeGroups: IPsecIkeGroup[]
  siteToSitePeers: IPsecPeer[]
  remoteAccess: IPsecRemoteAccess
  options: IPsecOptions
}

export function blankIPsecConfig(): IPsecConfig {
  return {
    enabled: false,
    disableUniqreqids: false,
    psks: [],
    ppks: [],
    espGroups: [],
    ikeGroups: [],
    siteToSitePeers: [],
    remoteAccess: blankIPsecRemoteAccess(),
    options: blankIPsecOptions(),
  }
}
