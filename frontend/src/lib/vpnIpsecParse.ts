import {
  blankIPsecConfig,
  blankIPsecEspGroup,
  blankIPsecIkeGroup,
  blankIPsecOptions,
  blankIPsecPeer,
  blankIPsecPeerAuthentication,
  blankIPsecPpk,
  blankIPsecPpkReference,
  blankIPsecPsk,
  blankIPsecRemoteAccess,
  blankIPsecRemoteAccessAuthentication,
  blankIPsecRemoteAccessConnection,
  blankIPsecRemoteAccessLocalUser,
  blankIPsecRemoteAccessPool,
  blankIPsecRemoteAccessRadius,
  blankIPsecRsaAuth,
  blankIPsecTunnel,
  blankIPsecVti,
  blankIPsecX509Auth,
  type IPsecConfig,
  type IPsecEspGroup,
  type IPsecEspProposal,
  type IPsecIkeGroup,
  type IPsecIkeProposal,
  type IPsecOptions,
  type IPsecPeer,
  type IPsecPeerAuthentication,
  type IPsecPpk,
  type IPsecPpkReference,
  type IPsecPsk,
  type IPsecRemoteAccess,
  type IPsecRemoteAccessAuthentication,
  type IPsecRemoteAccessConnection,
  type IPsecRemoteAccessLocalUser,
  type IPsecRemoteAccessPool,
  type IPsecRemoteAccessRadius,
  type IPsecRemoteAccessRadiusServer,
  type IPsecRsaAuth,
  type IPsecTunnel,
  type IPsecVti,
  type IPsecX509Auth,
} from './vpnIpsecTypes'

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

// --- authentication (psk / ppk stores) ----------------------------------

function parsePsk(name: string, raw: unknown): IPsecPsk {
  return {
    name,
    ...blankIPsecPsk(),
    ids: asStringArray(child(raw, 'id')),
    hasSecret: child(raw, 'secret') !== undefined,
    secretType: asString(child(raw, 'secret-type')),
    dhcpInterfaces: asStringArray(child(raw, 'dhcp-interface')),
  }
}

function parsePpk(name: string, raw: unknown): IPsecPpk {
  return {
    name,
    ...blankIPsecPpk(),
    ids: asStringArray(child(raw, 'id')),
    hasSecret: child(raw, 'secret') !== undefined,
    secretType: asString(child(raw, 'secret-type')),
  }
}

function parsePpkReference(raw: unknown): IPsecPpkReference {
  const root = child(raw, 'ppk')
  if (root === undefined) return blankIPsecPpkReference()
  return { id: asString(child(root, 'id')), required: isFlagPresent(root, 'required') }
}

function parseX509Auth(raw: unknown): IPsecX509Auth {
  const root = child(raw, 'x509')
  if (root === undefined) return blankIPsecX509Auth()
  return {
    certificate: asString(child(root, 'certificate')),
    hasPassphrase: child(root, 'passphrase') !== undefined,
    caCertificates: asStringArray(child(root, 'ca-certificate')),
  }
}

function parseRsaAuth(raw: unknown): IPsecRsaAuth {
  const root = child(raw, 'rsa')
  if (root === undefined) return blankIPsecRsaAuth()
  return {
    localKey: asString(child(root, 'local-key')),
    hasPassphrase: child(root, 'passphrase') !== undefined,
    remoteKey: asString(child(root, 'remote-key')),
  }
}

// --- esp-group / ike-group -----------------------------------------------

function parseEspProposal(id: string, raw: unknown): IPsecEspProposal {
  return {
    id,
    encryption: asString(child(raw, 'encryption')),
    hash: asString(child(raw, 'hash')),
    esn: asString(child(raw, 'esn')),
  }
}

function parseEspGroup(name: string, raw: unknown): IPsecEspGroup {
  return {
    name,
    ...blankIPsecEspGroup(),
    compression: isFlagPresent(raw, 'compression'),
    lifetime: asString(child(raw, 'lifetime')),
    lifeBytes: asString(child(raw, 'life-bytes')),
    lifePackets: asString(child(raw, 'life-packets')),
    disableRekey: isFlagPresent(raw, 'disable-rekey'),
    mode: asString(child(raw, 'mode')),
    pfs: asString(child(raw, 'pfs')),
    proposals: entries(child(raw, 'proposal'))
      .map(([id, propRaw]) => parseEspProposal(id, propRaw))
      .sort((a, b) => Number(a.id) - Number(b.id)),
  }
}

function parseIkeProposal(id: string, raw: unknown): IPsecIkeProposal {
  return {
    id,
    dhGroup: asString(child(raw, 'dh-group')),
    prf: asString(child(raw, 'prf')),
    encryption: asString(child(raw, 'encryption')),
    hash: asString(child(raw, 'hash')),
    esn: asString(child(raw, 'esn')),
  }
}

function parseIkeGroup(name: string, raw: unknown): IPsecIkeGroup {
  const dpd = child(raw, 'dead-peer-detection')
  return {
    name,
    ...blankIPsecIkeGroup(),
    closeAction: asString(child(raw, 'close-action')),
    dpdAction: asString(child(dpd, 'action')),
    dpdInterval: asString(child(dpd, 'interval')),
    dpdTimeout: asString(child(dpd, 'timeout')),
    ikev2Reauth: isFlagPresent(raw, 'ikev2-reauth'),
    keyExchange: asString(child(raw, 'key-exchange')),
    lifetime: asString(child(raw, 'lifetime')),
    disableMobike: isFlagPresent(raw, 'disable-mobike'),
    mode: asString(child(raw, 'mode')),
    proposals: entries(child(raw, 'proposal'))
      .map(([id, propRaw]) => parseIkeProposal(id, propRaw))
      .sort((a, b) => Number(a.id) - Number(b.id)),
  }
}

// --- site-to-site ----------------------------------------------------------

function parsePeerAuthentication(raw: unknown): IPsecPeerAuthentication {
  const root = child(raw, 'authentication')
  return {
    ...blankIPsecPeerAuthentication(),
    localId: asString(child(root, 'local-id')),
    remoteId: asString(child(root, 'remote-id')),
    ppk: parsePpkReference(root),
    rsa: parseRsaAuth(root),
    x509: parseX509Auth(root),
    mode: asString(child(root, 'mode')),
    useX509Id: isFlagPresent(root, 'use-x509-id'),
  }
}

function parseTunnel(id: string, raw: unknown): IPsecTunnel {
  const local = child(raw, 'local')
  const remote = child(raw, 'remote')
  return {
    id,
    ...blankIPsecTunnel(),
    disabled: isFlagPresent(raw, 'disable'),
    espGroup: asString(child(raw, 'esp-group')),
    localPort: asString(child(local, 'port')),
    localPrefixes: asStringArray(child(local, 'prefix')),
    protocol: asString(child(raw, 'protocol')),
    priority: asString(child(raw, 'priority')),
    remotePort: asString(child(remote, 'port')),
    remotePrefixes: asStringArray(child(remote, 'prefix')),
  }
}

function parseVti(raw: unknown): IPsecVti {
  const root = child(raw, 'vti')
  if (root === undefined) return blankIPsecVti()
  const selector = child(root, 'traffic-selector')
  return {
    bind: asString(child(root, 'bind')),
    espGroup: asString(child(root, 'esp-group')),
    localPrefixes: asStringArray(child(child(selector, 'local'), 'prefix')),
    remotePrefixes: asStringArray(child(child(selector, 'remote'), 'prefix')),
  }
}

function parsePeer(name: string, raw: unknown): IPsecPeer {
  return {
    name,
    ...blankIPsecPeer(),
    disabled: isFlagPresent(raw, 'disable'),
    authentication: parsePeerAuthentication(raw),
    childless: asString(child(raw, 'childless')),
    connectionType: asString(child(raw, 'connection-type')),
    defaultEspGroup: asString(child(raw, 'default-esp-group')),
    description: asString(child(raw, 'description')),
    dhcpInterface: asString(child(raw, 'dhcp-interface')),
    forceUdpEncapsulation: isFlagPresent(raw, 'force-udp-encapsulation'),
    ikeGroup: asString(child(raw, 'ike-group')),
    ikev2Reauth: asString(child(raw, 'ikev2-reauth')),
    localAddress: asString(child(raw, 'local-address')),
    remoteAddresses: asStringArray(child(raw, 'remote-address')),
    replayWindow: asString(child(raw, 'replay-window')),
    tunnels: entries(child(raw, 'tunnel'))
      .map(([id, tunnelRaw]) => parseTunnel(id, tunnelRaw))
      .sort((a, b) => Number(a.id) - Number(b.id)),
    virtualAddresses: asStringArray(child(raw, 'virtual-address')),
    vti: parseVti(raw),
  }
}

// --- remote-access -----------------------------------------------------

function parseLocalUser(username: string, raw: unknown): IPsecRemoteAccessLocalUser {
  return {
    username,
    ...blankIPsecRemoteAccessLocalUser(),
    disabled: isFlagPresent(raw, 'disable'),
    hasPassword: child(raw, 'password') !== undefined,
  }
}

function parseRemoteAccessAuthentication(raw: unknown): IPsecRemoteAccessAuthentication {
  const root = child(raw, 'authentication')
  return {
    ...blankIPsecRemoteAccessAuthentication(),
    localId: asString(child(root, 'local-id')),
    x509: parseX509Auth(root),
    eapId: asString(child(root, 'eap-id')),
    clientMode: asString(child(root, 'client-mode')),
    localUsers: entries(child(child(root, 'local-users'), 'username'))
      .map(([username, userRaw]) => parseLocalUser(username, userRaw))
      .sort((a, b) => a.username.localeCompare(b.username)),
    alwaysSendCert: isFlagPresent(root, 'always-send-cert'),
    serverMode: asString(child(root, 'server-mode')),
    ppk: parsePpkReference(root),
    hasPreSharedSecret: child(root, 'pre-shared-secret') !== undefined,
  }
}

function parseConnection(name: string, raw: unknown): IPsecRemoteAccessConnection {
  const selector = child(raw, 'local-traffic-selector')
  return {
    name,
    ...blankIPsecRemoteAccessConnection(),
    authentication: parseRemoteAccessAuthentication(raw),
    childless: asString(child(raw, 'childless')),
    description: asString(child(raw, 'description')),
    disabled: isFlagPresent(raw, 'disable'),
    espGroup: asString(child(raw, 'esp-group')),
    ikeGroup: asString(child(raw, 'ike-group')),
    localAddress: asString(child(raw, 'local-address')),
    dhcpInterface: asString(child(raw, 'dhcp-interface')),
    localTrafficSelectorPort: asString(child(selector, 'port')),
    localTrafficSelectorPrefixes: asStringArray(child(selector, 'prefix')),
    replayWindow: asString(child(raw, 'replay-window')),
    bind: asString(child(raw, 'bind')),
    timeout: asString(child(raw, 'timeout')),
    pools: asStringArray(child(raw, 'pool')),
    unique: asString(child(raw, 'unique')),
  }
}

function parsePool(name: string, raw: unknown): IPsecRemoteAccessPool {
  const range = child(raw, 'range')
  return {
    name,
    ...blankIPsecRemoteAccessPool(),
    excludePrefixes: asStringArray(child(raw, 'exclude')),
    prefix: asString(child(raw, 'prefix')),
    rangeStart: asString(child(range, 'start')),
    rangeStop: asString(child(range, 'stop')),
    nameServers: asStringArray(child(raw, 'name-server')),
  }
}

function parseRadiusServer(address: string, raw: unknown): IPsecRemoteAccessRadiusServer {
  return {
    address,
    disabled: isFlagPresent(raw, 'disable'),
    hasKey: child(raw, 'key') !== undefined,
    port: asString(child(raw, 'port')),
    disableAccounting: isFlagPresent(raw, 'disable-accounting'),
  }
}

function parseRemoteAccessRadius(raw: unknown): IPsecRemoteAccessRadius {
  const root = child(raw, 'radius')
  if (root === undefined) return blankIPsecRemoteAccessRadius()
  return {
    sourceAddress: asString(child(root, 'source-address')),
    timeout: asString(child(root, 'timeout')),
    nasIdentifier: asString(child(root, 'nas-identifier')),
    servers: entries(child(root, 'server'))
      .map(([address, serverRaw]) => parseRadiusServer(address, serverRaw))
      .sort((a, b) => a.address.localeCompare(b.address)),
  }
}

function parseRemoteAccess(raw: unknown): IPsecRemoteAccess {
  const root = child(raw, 'remote-access')
  if (root === undefined) return blankIPsecRemoteAccess()
  const dhcp = child(root, 'dhcp')
  return {
    connections: entries(child(root, 'connection'))
      .map(([name, connRaw]) => parseConnection(name, connRaw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    dhcp: { interface: asString(child(dhcp, 'interface')), server: asString(child(dhcp, 'server')) },
    pools: entries(child(root, 'pool'))
      .map(([name, poolRaw]) => parsePool(name, poolRaw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    radius: parseRemoteAccessRadius(root),
  }
}

// --- options -----------------------------------------------------------

function parseOptions(ipsec: unknown): IPsecOptions {
  const root = child(ipsec, 'options')
  if (root === undefined) return blankIPsecOptions()
  const retransmission = child(root, 'retransmission')
  return {
    disableRouteAutoinstall: isFlagPresent(root, 'disable-route-autoinstall'),
    flexvpn: isFlagPresent(root, 'flexvpn'),
    interface: asString(child(root, 'interface')),
    virtualIp: isFlagPresent(root, 'virtual-ip'),
    retransmissionAttempts: asString(child(retransmission, 'attempts')),
    retransmissionBase: asString(child(retransmission, 'base')),
    retransmissionTimeout: asString(child(retransmission, 'timeout')),
  }
}

// --- top level -------------------------------------------------------------

export function parseIPsecConfig(ipsec: unknown): IPsecConfig {
  if (ipsec === undefined) return blankIPsecConfig()
  const auth = child(ipsec, 'authentication')
  return {
    enabled: true,
    disableUniqreqids: isFlagPresent(ipsec, 'disable-uniqreqids'),
    psks: entries(child(auth, 'psk'))
      .map(([name, raw]) => parsePsk(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ppks: entries(child(auth, 'ppk'))
      .map(([name, raw]) => parsePpk(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    espGroups: entries(child(ipsec, 'esp-group'))
      .map(([name, raw]) => parseEspGroup(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ikeGroups: entries(child(ipsec, 'ike-group'))
      .map(([name, raw]) => parseIkeGroup(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    siteToSitePeers: entries(child(child(ipsec, 'site-to-site'), 'peer'))
      .map(([name, raw]) => parsePeer(name, raw))
      .sort((a, b) => a.name.localeCompare(b.name)),
    remoteAccess: parseRemoteAccess(ipsec),
    options: parseOptions(ipsec),
  }
}

// --- path builders -----------------------------------------------------

export function ipsecPath(...rest: string[]): string[] {
  return ['vpn', 'ipsec', ...rest]
}

export function ipsecAuthPath(...rest: string[]): string[] {
  return ipsecPath('authentication', ...rest)
}

export function ipsecPskPath(name: string, ...rest: string[]): string[] {
  return ipsecAuthPath('psk', name, ...rest)
}

export function ipsecPpkPath(name: string, ...rest: string[]): string[] {
  return ipsecAuthPath('ppk', name, ...rest)
}

export function ipsecEspGroupPath(name: string, ...rest: string[]): string[] {
  return ipsecPath('esp-group', name, ...rest)
}

export function ipsecEspProposalPath(name: string, id: string, ...rest: string[]): string[] {
  return ipsecEspGroupPath(name, 'proposal', id, ...rest)
}

export function ipsecIkeGroupPath(name: string, ...rest: string[]): string[] {
  return ipsecPath('ike-group', name, ...rest)
}

export function ipsecIkeProposalPath(name: string, id: string, ...rest: string[]): string[] {
  return ipsecIkeGroupPath(name, 'proposal', id, ...rest)
}

export function ipsecPeerPath(name: string, ...rest: string[]): string[] {
  return ipsecPath('site-to-site', 'peer', name, ...rest)
}

export function ipsecTunnelPath(peerName: string, id: string, ...rest: string[]): string[] {
  return ipsecPeerPath(peerName, 'tunnel', id, ...rest)
}

export function ipsecRemoteAccessPath(...rest: string[]): string[] {
  return ipsecPath('remote-access', ...rest)
}

export function ipsecConnectionPath(name: string, ...rest: string[]): string[] {
  return ipsecRemoteAccessPath('connection', name, ...rest)
}

export function ipsecRemoteAccessPoolPath(name: string, ...rest: string[]): string[] {
  return ipsecRemoteAccessPath('pool', name, ...rest)
}

export function ipsecRemoteAccessRadiusServerPath(address: string, ...rest: string[]): string[] {
  return ipsecRemoteAccessPath('radius', 'server', address, ...rest)
}

export function ipsecOptionsPath(...rest: string[]): string[] {
  return ipsecPath('options', ...rest)
}
