import {
  ipsecConnectionPath,
  ipsecEspGroupPath,
  ipsecEspProposalPath,
  ipsecIkeGroupPath,
  ipsecIkeProposalPath,
  ipsecOptionsPath,
  ipsecPath,
  ipsecPeerPath,
  ipsecPpkPath,
  ipsecPskPath,
  ipsecRemoteAccessPath,
  ipsecRemoteAccessPoolPath,
  ipsecRemoteAccessRadiusServerPath,
  ipsecTunnelPath,
} from './vpnIpsecParse'
import type {
  IPsecEspGroup,
  IPsecOptions,
  IPsecPeer,
  IPsecRemoteAccessConnection,
} from './vpnIpsecTypes'
import type { ConfigOp } from './vyosApi'

export function enableIPsecOp(): ConfigOp {
  return { op: 'set', path: ipsecPath() }
}

export function disableIPsecOp(): ConfigOp {
  return { op: 'delete', path: ipsecPath() }
}

export function toggleDisableUniqreqidsOp(disabled: boolean): ConfigOp {
  const path = ipsecPath('disable-uniqreqids')
  return disabled ? { op: 'set', path } : { op: 'delete', path }
}

// --- authentication (psk / ppk) -------------------------------------------

export interface PskFormOptions {
  ids: string[]
  secret: string
  secretType: string
}

/** Creating a PSK always sets its full id list and a fresh secret -
 * there's no partial-diff editing for these (add/remove is the whole
 * UI, same as most tagNode-keyed lists elsewhere in this app). */
export function addPskOps(name: string, options: PskFormOptions): ConfigOp[] {
  const base = ipsecPskPath(name)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  for (const id of options.ids) {
    ops.push({ op: 'set', path: [...base, 'id'], value: id })
  }
  const trimmedSecret = options.secret.trim()
  if (trimmedSecret) ops.push({ op: 'set', path: [...base, 'secret'], value: trimmedSecret })
  if (options.secretType) ops.push({ op: 'set', path: [...base, 'secret-type'], value: options.secretType })
  return ops
}

export function removePskOp(name: string): ConfigOp {
  return { op: 'delete', path: ipsecPskPath(name) }
}

export function addPpkOps(name: string, options: PskFormOptions): ConfigOp[] {
  const base = ipsecPpkPath(name)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  for (const id of options.ids) {
    ops.push({ op: 'set', path: [...base, 'id'], value: id })
  }
  const trimmedSecret = options.secret.trim()
  if (trimmedSecret) ops.push({ op: 'set', path: [...base, 'secret'], value: trimmedSecret })
  if (options.secretType) ops.push({ op: 'set', path: [...base, 'secret-type'], value: options.secretType })
  return ops
}

export function removePpkOp(name: string): ConfigOp {
  return { op: 'delete', path: ipsecPpkPath(name) }
}

// --- esp-group / ike-group -----------------------------------------------

export interface EspGroupFormValues {
  compression: boolean
  lifetime: string
  lifeBytes: string
  lifePackets: string
  disableRekey: boolean
  mode: string
  pfs: string
}

export function blankEspGroupFormValues(): EspGroupFormValues {
  return { compression: false, lifetime: '', lifeBytes: '', lifePackets: '', disableRekey: false, mode: '', pfs: '' }
}

export function espGroupToFormValues(group: IPsecEspGroup): EspGroupFormValues {
  return {
    compression: group.compression,
    lifetime: group.lifetime ?? '',
    lifeBytes: group.lifeBytes ?? '',
    lifePackets: group.lifePackets ?? '',
    disableRekey: group.disableRekey,
    mode: group.mode ?? '',
    pfs: group.pfs ?? '',
  }
}

export function espGroupFormToOps(
  name: string,
  before: IPsecEspGroup | undefined,
  values: EspGroupFormValues,
): ConfigOp[] {
  const beforeValues = before ? espGroupToFormValues(before) : blankEspGroupFormValues()
  const ops: ConfigOp[] = []
  const base = ipsecEspGroupPath(name)
  if (before === undefined) ops.push({ op: 'set', path: base })

  const flagFields: { get: (v: EspGroupFormValues) => boolean; segment: string }[] = [
    { get: (v) => v.compression, segment: 'compression' },
    { get: (v) => v.disableRekey, segment: 'disable-rekey' },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: EspGroupFormValues) => string; segment: string }[] = [
    { get: (v) => v.lifetime, segment: 'lifetime' },
    { get: (v) => v.lifeBytes, segment: 'life-bytes' },
    { get: (v) => v.lifePackets, segment: 'life-packets' },
    { get: (v) => v.mode, segment: 'mode' },
    { get: (v) => v.pfs, segment: 'pfs' },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function deleteEspGroupOp(name: string): ConfigOp {
  return { op: 'delete', path: ipsecEspGroupPath(name) }
}

export function addEspProposalOps(
  groupName: string,
  id: string,
  options: { encryption: string; hash: string; esn: string },
): ConfigOp[] {
  const base = ipsecEspProposalPath(groupName, id)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.encryption) ops.push({ op: 'set', path: [...base, 'encryption'], value: options.encryption })
  if (options.hash) ops.push({ op: 'set', path: [...base, 'hash'], value: options.hash })
  if (options.esn) ops.push({ op: 'set', path: [...base, 'esn'], value: options.esn })
  return ops
}

export function removeEspProposalOp(groupName: string, id: string): ConfigOp {
  return { op: 'delete', path: ipsecEspProposalPath(groupName, id) }
}

export interface IkeGroupFormValues {
  closeAction: string
  dpdAction: string
  dpdInterval: string
  dpdTimeout: string
  ikev2Reauth: boolean
  keyExchange: string
  lifetime: string
  disableMobike: boolean
  mode: string
}

export function blankIkeGroupFormValues(): IkeGroupFormValues {
  return {
    closeAction: '',
    dpdAction: '',
    dpdInterval: '',
    dpdTimeout: '',
    ikev2Reauth: false,
    keyExchange: '',
    lifetime: '',
    disableMobike: false,
    mode: '',
  }
}

export function ikeGroupToFormValues(group: {
  closeAction?: string
  dpdAction?: string
  dpdInterval?: string
  dpdTimeout?: string
  ikev2Reauth: boolean
  keyExchange?: string
  lifetime?: string
  disableMobike: boolean
  mode?: string
}): IkeGroupFormValues {
  return {
    closeAction: group.closeAction ?? '',
    dpdAction: group.dpdAction ?? '',
    dpdInterval: group.dpdInterval ?? '',
    dpdTimeout: group.dpdTimeout ?? '',
    ikev2Reauth: group.ikev2Reauth,
    keyExchange: group.keyExchange ?? '',
    lifetime: group.lifetime ?? '',
    disableMobike: group.disableMobike,
    mode: group.mode ?? '',
  }
}

export function ikeGroupFormToOps(
  name: string,
  before: Parameters<typeof ikeGroupToFormValues>[0] | undefined,
  values: IkeGroupFormValues,
): ConfigOp[] {
  const beforeValues = before ? ikeGroupToFormValues(before) : blankIkeGroupFormValues()
  const ops: ConfigOp[] = []
  const base = ipsecIkeGroupPath(name)
  if (before === undefined) ops.push({ op: 'set', path: base })

  const flagFields: { get: (v: IkeGroupFormValues) => boolean; segment: string }[] = [
    { get: (v) => v.ikev2Reauth, segment: 'ikev2-reauth' },
    { get: (v) => v.disableMobike, segment: 'disable-mobike' },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: IkeGroupFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.closeAction, segments: ['close-action'] },
    { get: (v) => v.dpdAction, segments: ['dead-peer-detection', 'action'] },
    { get: (v) => v.dpdInterval, segments: ['dead-peer-detection', 'interval'] },
    { get: (v) => v.dpdTimeout, segments: ['dead-peer-detection', 'timeout'] },
    { get: (v) => v.keyExchange, segments: ['key-exchange'] },
    { get: (v) => v.lifetime, segments: ['lifetime'] },
    { get: (v) => v.mode, segments: ['mode'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function deleteIkeGroupOp(name: string): ConfigOp {
  return { op: 'delete', path: ipsecIkeGroupPath(name) }
}

export function addIkeProposalOps(
  groupName: string,
  id: string,
  options: { dhGroup: string; prf: string; encryption: string; hash: string; esn: string },
): ConfigOp[] {
  const base = ipsecIkeProposalPath(groupName, id)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.dhGroup) ops.push({ op: 'set', path: [...base, 'dh-group'], value: options.dhGroup })
  if (options.prf) ops.push({ op: 'set', path: [...base, 'prf'], value: options.prf })
  if (options.encryption) ops.push({ op: 'set', path: [...base, 'encryption'], value: options.encryption })
  if (options.hash) ops.push({ op: 'set', path: [...base, 'hash'], value: options.hash })
  if (options.esn) ops.push({ op: 'set', path: [...base, 'esn'], value: options.esn })
  return ops
}

export function removeIkeProposalOp(groupName: string, id: string): ConfigOp {
  return { op: 'delete', path: ipsecIkeProposalPath(groupName, id) }
}

// --- site-to-site ----------------------------------------------------------

export interface PeerFormValues {
  disabled: boolean
  authMode: string
  localId: string
  remoteId: string
  useX509Id: boolean
  childless: string
  connectionType: string
  defaultEspGroup: string
  description: string
  ikeGroup: string
  ikev2Reauth: string
  localAddress: string
  replayWindow: string
  forceUdpEncapsulation: boolean
}

export function blankPeerFormValues(): PeerFormValues {
  return {
    disabled: false,
    authMode: '',
    localId: '',
    remoteId: '',
    useX509Id: false,
    childless: '',
    connectionType: '',
    defaultEspGroup: '',
    description: '',
    ikeGroup: '',
    ikev2Reauth: '',
    localAddress: '',
    replayWindow: '',
    forceUdpEncapsulation: false,
  }
}

export function peerToFormValues(peer: IPsecPeer): PeerFormValues {
  return {
    disabled: peer.disabled,
    authMode: peer.authentication.mode ?? '',
    localId: peer.authentication.localId ?? '',
    remoteId: peer.authentication.remoteId ?? '',
    useX509Id: peer.authentication.useX509Id,
    childless: peer.childless ?? '',
    connectionType: peer.connectionType ?? '',
    defaultEspGroup: peer.defaultEspGroup ?? '',
    description: peer.description ?? '',
    ikeGroup: peer.ikeGroup ?? '',
    ikev2Reauth: peer.ikev2Reauth ?? '',
    localAddress: peer.localAddress ?? '',
    replayWindow: peer.replayWindow ?? '',
    forceUdpEncapsulation: peer.forceUdpEncapsulation,
  }
}

export function peerFormToOps(
  name: string,
  before: IPsecPeer | undefined,
  values: PeerFormValues,
): ConfigOp[] {
  const beforeValues = before ? peerToFormValues(before) : blankPeerFormValues()
  const ops: ConfigOp[] = []
  const base = ipsecPeerPath(name)
  if (before === undefined) ops.push({ op: 'set', path: base })

  const flagFields: { get: (v: PeerFormValues) => boolean; segments: string[] }[] = [
    { get: (v) => v.disabled, segments: ['disable'] },
    { get: (v) => v.useX509Id, segments: ['authentication', 'use-x509-id'] },
    { get: (v) => v.forceUdpEncapsulation, segments: ['force-udp-encapsulation'] },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: PeerFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.authMode, segments: ['authentication', 'mode'] },
    { get: (v) => v.localId, segments: ['authentication', 'local-id'] },
    { get: (v) => v.remoteId, segments: ['authentication', 'remote-id'] },
    { get: (v) => v.childless, segments: ['childless'] },
    { get: (v) => v.connectionType, segments: ['connection-type'] },
    { get: (v) => v.defaultEspGroup, segments: ['default-esp-group'] },
    { get: (v) => v.description, segments: ['description'] },
    { get: (v) => v.ikeGroup, segments: ['ike-group'] },
    { get: (v) => v.ikev2Reauth, segments: ['ikev2-reauth'] },
    { get: (v) => v.localAddress, segments: ['local-address'] },
    { get: (v) => v.replayWindow, segments: ['replay-window'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function deletePeerOp(name: string): ConfigOp {
  return { op: 'delete', path: ipsecPeerPath(name) }
}

export function addTunnelOps(
  peerName: string,
  id: string,
  options: { espGroup: string; protocol: string },
): ConfigOp[] {
  const base = ipsecTunnelPath(peerName, id)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.espGroup) ops.push({ op: 'set', path: [...base, 'esp-group'], value: options.espGroup })
  if (options.protocol) ops.push({ op: 'set', path: [...base, 'protocol'], value: options.protocol })
  return ops
}

export function removeTunnelOp(peerName: string, id: string): ConfigOp {
  return { op: 'delete', path: ipsecTunnelPath(peerName, id) }
}

// --- remote-access -----------------------------------------------------

export interface ConnectionFormValues {
  disabled: boolean
  description: string
  espGroup: string
  ikeGroup: string
  localAddress: string
  clientMode: string
  serverMode: string
  eapId: string
  hasPreSharedSecret: string
  timeout: string
  unique: string
}

export function blankConnectionFormValues(): ConnectionFormValues {
  return {
    disabled: false,
    description: '',
    espGroup: '',
    ikeGroup: '',
    localAddress: '',
    clientMode: '',
    serverMode: '',
    eapId: '',
    hasPreSharedSecret: '',
    timeout: '',
    unique: '',
  }
}

export function connectionToFormValues(conn: IPsecRemoteAccessConnection): ConnectionFormValues {
  return {
    disabled: conn.disabled,
    description: conn.description ?? '',
    espGroup: conn.espGroup ?? '',
    ikeGroup: conn.ikeGroup ?? '',
    localAddress: conn.localAddress ?? '',
    clientMode: conn.authentication.clientMode ?? '',
    serverMode: conn.authentication.serverMode ?? '',
    eapId: conn.authentication.eapId ?? '',
    hasPreSharedSecret: '',
    timeout: conn.timeout ?? '',
    unique: conn.unique ?? '',
  }
}

export function connectionFormToOps(
  name: string,
  before: IPsecRemoteAccessConnection | undefined,
  values: ConnectionFormValues,
): ConfigOp[] {
  const beforeValues = before ? connectionToFormValues(before) : blankConnectionFormValues()
  const ops: ConfigOp[] = []
  const base = ipsecConnectionPath(name)
  if (before === undefined) ops.push({ op: 'set', path: base })

  if (beforeValues.disabled !== values.disabled) {
    const path = [...base, 'disable']
    ops.push(values.disabled ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: ConnectionFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.description, segments: ['description'] },
    { get: (v) => v.espGroup, segments: ['esp-group'] },
    { get: (v) => v.ikeGroup, segments: ['ike-group'] },
    { get: (v) => v.localAddress, segments: ['local-address'] },
    { get: (v) => v.clientMode, segments: ['authentication', 'client-mode'] },
    { get: (v) => v.serverMode, segments: ['authentication', 'server-mode'] },
    { get: (v) => v.eapId, segments: ['authentication', 'eap-id'] },
    { get: (v) => v.timeout, segments: ['timeout'] },
    { get: (v) => v.unique, segments: ['unique'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  const trimmedSecret = values.hasPreSharedSecret.trim()
  if (trimmedSecret) {
    ops.push({ op: 'set', path: [...base, 'authentication', 'pre-shared-secret'], value: trimmedSecret })
  }

  return ops
}

export function deleteConnectionOp(name: string): ConfigOp {
  return { op: 'delete', path: ipsecConnectionPath(name) }
}

export function addRemoteAccessLocalUserOps(connectionName: string, username: string, password: string): ConfigOp[] {
  const base = [...ipsecConnectionPath(connectionName), 'authentication', 'local-users', 'username', username]
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmed = password.trim()
  if (trimmed) ops.push({ op: 'set', path: [...base, 'password'], value: trimmed })
  return ops
}

export function removeRemoteAccessLocalUserOp(connectionName: string, username: string): ConfigOp {
  return {
    op: 'delete',
    path: [...ipsecConnectionPath(connectionName), 'authentication', 'local-users', 'username', username],
  }
}

export function addRemoteAccessPoolOps(
  name: string,
  options: { prefix: string; rangeStart: string; rangeStop: string },
): ConfigOp[] {
  const base = ipsecRemoteAccessPoolPath(name)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.prefix.trim()) ops.push({ op: 'set', path: [...base, 'prefix'], value: options.prefix.trim() })
  if (options.rangeStart.trim()) {
    ops.push({ op: 'set', path: [...base, 'range', 'start'], value: options.rangeStart.trim() })
  }
  if (options.rangeStop.trim()) {
    ops.push({ op: 'set', path: [...base, 'range', 'stop'], value: options.rangeStop.trim() })
  }
  return ops
}

export function removeRemoteAccessPoolOp(name: string): ConfigOp {
  return { op: 'delete', path: ipsecRemoteAccessPoolPath(name) }
}

export function addRemoteAccessRadiusServerOps(address: string, key: string, port: string): ConfigOp[] {
  const base = ipsecRemoteAccessRadiusServerPath(address)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmedKey = key.trim()
  if (trimmedKey) ops.push({ op: 'set', path: [...base, 'key'], value: trimmedKey })
  if (port.trim()) ops.push({ op: 'set', path: [...base, 'port'], value: port.trim() })
  return ops
}

export function removeRemoteAccessRadiusServerOp(address: string): ConfigOp {
  return { op: 'delete', path: ipsecRemoteAccessRadiusServerPath(address) }
}

export interface RemoteAccessRadiusSettingsFormValues {
  sourceAddress: string
  timeout: string
  nasIdentifier: string
}

export function blankRemoteAccessRadiusSettingsFormValues(): RemoteAccessRadiusSettingsFormValues {
  return { sourceAddress: '', timeout: '', nasIdentifier: '' }
}

export function remoteAccessRadiusToFormValues(radius: {
  sourceAddress?: string
  timeout?: string
  nasIdentifier?: string
}): RemoteAccessRadiusSettingsFormValues {
  return {
    sourceAddress: radius.sourceAddress ?? '',
    timeout: radius.timeout ?? '',
    nasIdentifier: radius.nasIdentifier ?? '',
  }
}

export function remoteAccessRadiusSettingsFormToOps(
  before: { sourceAddress?: string; timeout?: string; nasIdentifier?: string },
  values: RemoteAccessRadiusSettingsFormValues,
): ConfigOp[] {
  const beforeValues = remoteAccessRadiusToFormValues(before)
  const ops: ConfigOp[] = []
  const base = ipsecRemoteAccessPath('radius')
  const fields: { get: (v: RemoteAccessRadiusSettingsFormValues) => string; segment: string }[] = [
    { get: (v) => v.sourceAddress, segment: 'source-address' },
    { get: (v) => v.timeout, segment: 'timeout' },
    { get: (v) => v.nasIdentifier, segment: 'nas-identifier' },
  ]
  for (const field of fields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

// --- options -----------------------------------------------------------

export interface OptionsFormValues {
  disableRouteAutoinstall: boolean
  flexvpn: boolean
  virtualIp: boolean
  interface: string
  retransmissionAttempts: string
  retransmissionBase: string
  retransmissionTimeout: string
}

export function blankOptionsFormValues(): OptionsFormValues {
  return {
    disableRouteAutoinstall: false,
    flexvpn: false,
    virtualIp: false,
    interface: '',
    retransmissionAttempts: '',
    retransmissionBase: '',
    retransmissionTimeout: '',
  }
}

export function optionsToFormValues(options: IPsecOptions): OptionsFormValues {
  return {
    disableRouteAutoinstall: options.disableRouteAutoinstall,
    flexvpn: options.flexvpn,
    virtualIp: options.virtualIp,
    interface: options.interface ?? '',
    retransmissionAttempts: options.retransmissionAttempts ?? '',
    retransmissionBase: options.retransmissionBase ?? '',
    retransmissionTimeout: options.retransmissionTimeout ?? '',
  }
}

export function optionsFormToOps(before: IPsecOptions, values: OptionsFormValues): ConfigOp[] {
  const beforeValues = optionsToFormValues(before)
  const ops: ConfigOp[] = []
  const base = ipsecOptionsPath()

  const flagFields: { get: (v: OptionsFormValues) => boolean; segment: string }[] = [
    { get: (v) => v.disableRouteAutoinstall, segment: 'disable-route-autoinstall' },
    { get: (v) => v.flexvpn, segment: 'flexvpn' },
    { get: (v) => v.virtualIp, segment: 'virtual-ip' },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: OptionsFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.interface, segments: ['interface'] },
    { get: (v) => v.retransmissionAttempts, segments: ['retransmission', 'attempts'] },
    { get: (v) => v.retransmissionBase, segments: ['retransmission', 'base'] },
    { get: (v) => v.retransmissionTimeout, segments: ['retransmission', 'timeout'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

