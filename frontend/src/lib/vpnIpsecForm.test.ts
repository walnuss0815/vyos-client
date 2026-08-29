import { describe, expect, it } from 'vitest'
import {
  addEspProposalOps,
  addIkeProposalOps,
  addPpkOps,
  addPskOps,
  addRemoteAccessLocalUserOps,
  addRemoteAccessPoolOps,
  addRemoteAccessRadiusServerOps,
  addTunnelOps,
  blankConnectionFormValues,
  blankEspGroupFormValues,
  blankIkeGroupFormValues,
  blankOptionsFormValues,
  blankPeerFormValues,
  connectionFormToOps,
  connectionToFormValues,
  deleteConnectionOp,
  deleteEspGroupOp,
  deleteIkeGroupOp,
  deletePeerOp,
  disableIPsecOp,
  enableIPsecOp,
  espGroupFormToOps,
  espGroupToFormValues,
  ikeGroupFormToOps,
  optionsFormToOps,
  optionsToFormValues,
  peerFormToOps,
  peerToFormValues,
  remoteAccessRadiusSettingsFormToOps,
  removeEspProposalOp,
  removeIkeProposalOp,
  removePpkOp,
  removePskOp,
  removeRemoteAccessLocalUserOp,
  removeRemoteAccessPoolOp,
  removeRemoteAccessRadiusServerOp,
  removeTunnelOp,
  toggleDisableUniqreqidsOp,
} from './vpnIpsecForm'
import {
  blankIPsecEspGroup,
  blankIPsecOptions,
  blankIPsecPeer,
  blankIPsecRemoteAccessConnection,
  type IPsecEspGroup,
  type IPsecPeer,
  type IPsecRemoteAccessConnection,
} from './vpnIpsecTypes'

describe('enable/disable/uniqreqids ops', () => {
  it('builds the expected ops', () => {
    expect(enableIPsecOp()).toEqual({ op: 'set', path: ['vpn', 'ipsec'] })
    expect(disableIPsecOp()).toEqual({ op: 'delete', path: ['vpn', 'ipsec'] })
    expect(toggleDisableUniqreqidsOp(true)).toEqual({ op: 'set', path: ['vpn', 'ipsec', 'disable-uniqreqids'] })
    expect(toggleDisableUniqreqidsOp(false)).toEqual({ op: 'delete', path: ['vpn', 'ipsec', 'disable-uniqreqids'] })
  })
})

describe('psk / ppk ops', () => {
  it('queues the tag, id list, and a fresh secret', () => {
    const ops = addPskOps('peer-1', { ids: ['192.0.2.1', '192.0.2.2'], secret: 'super-secret', secretType: 'plaintext' })
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'authentication', 'psk', 'peer-1'] },
      { op: 'set', path: ['vpn', 'ipsec', 'authentication', 'psk', 'peer-1', 'id'], value: '192.0.2.1' },
      { op: 'set', path: ['vpn', 'ipsec', 'authentication', 'psk', 'peer-1', 'id'], value: '192.0.2.2' },
      { op: 'set', path: ['vpn', 'ipsec', 'authentication', 'psk', 'peer-1', 'secret'], value: 'super-secret' },
      { op: 'set', path: ['vpn', 'ipsec', 'authentication', 'psk', 'peer-1', 'secret-type'], value: 'plaintext' },
    ])
  })

  it('builds a psk remove op', () => {
    expect(removePskOp('peer-1')).toEqual({ op: 'delete', path: ['vpn', 'ipsec', 'authentication', 'psk', 'peer-1'] })
  })

  it('queues a ppk the same way', () => {
    const ops = addPpkOps('ppk-1', { ids: ['192.0.2.1'], secret: 'super-secret', secretType: '' })
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'authentication', 'ppk', 'ppk-1'] },
      { op: 'set', path: ['vpn', 'ipsec', 'authentication', 'ppk', 'ppk-1', 'id'], value: '192.0.2.1' },
      { op: 'set', path: ['vpn', 'ipsec', 'authentication', 'ppk', 'ppk-1', 'secret'], value: 'super-secret' },
    ])
  })

  it('builds a ppk remove op', () => {
    expect(removePpkOp('ppk-1')).toEqual({ op: 'delete', path: ['vpn', 'ipsec', 'authentication', 'ppk', 'ppk-1'] })
  })
})

function emptyEspGroup(overrides: Partial<IPsecEspGroup> = {}): IPsecEspGroup {
  return { name: 'ESP-DEFAULT', ...blankIPsecEspGroup(), ...overrides }
}

describe('espGroupFormToOps', () => {
  it('always sets the tag for a brand-new group', () => {
    expect(espGroupFormToOps('ESP-DEFAULT', undefined, blankEspGroupFormValues())).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT'] },
    ])
  })

  it('queues flag and scalar fields', () => {
    const values = blankEspGroupFormValues()
    values.compression = true
    values.mode = 'transport'

    const ops = espGroupFormToOps('ESP-DEFAULT', undefined, values)
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'compression'] },
        { op: 'set', path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'mode'], value: 'transport' },
      ]),
    )
  })

  it('queues nothing extra when editing unchanged', () => {
    const group = emptyEspGroup({ mode: 'tunnel' })
    expect(espGroupFormToOps('ESP-DEFAULT', group, espGroupToFormValues(group))).toEqual([])
  })

  // Regression test: this used to check the raw (untrimmed) value, so
  // whitespace-only input queued a `set` with a literal whitespace
  // value instead of being treated the same as actually clearing the
  // field - the same fix applies to every scalar field loop in this
  // file (ikeGroupFormToOps/peerFormToOps/connectionFormToOps/
  // remoteAccessRadiusSettingsFormToOps/optionsFormToOps), all of
  // which share this exact pattern.
  it('treats a whitespace-only scalar field the same as clearing it', () => {
    const group = emptyEspGroup({ lifetime: '3600' })
    const values = espGroupToFormValues(group)
    values.lifetime = '   '

    const ops = espGroupFormToOps('ESP-DEFAULT', group, values)

    expect(ops).toEqual([{ op: 'delete', path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'lifetime'] }])
  })
})

describe('deleteEspGroupOp', () => {
  it('builds a delete op', () => {
    expect(deleteEspGroupOp('ESP-DEFAULT')).toEqual({ op: 'delete', path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT'] })
  })
})

describe('esp proposal ops', () => {
  it('always sets the tag, plus any given fields', () => {
    const ops = addEspProposalOps('ESP-DEFAULT', '1', { encryption: 'aes256', hash: 'sha256', esn: '' })
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'proposal', '1'] },
      { op: 'set', path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'proposal', '1', 'encryption'], value: 'aes256' },
      { op: 'set', path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'proposal', '1', 'hash'], value: 'sha256' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeEspProposalOp('ESP-DEFAULT', '1')).toEqual({
      op: 'delete',
      path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'proposal', '1'],
    })
  })
})

describe('ikeGroupFormToOps', () => {
  it('always sets the tag for a brand-new group', () => {
    expect(ikeGroupFormToOps('IKE-DEFAULT', undefined, blankIkeGroupFormValues())).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT'] },
    ])
  })

  it('queues nested dead-peer-detection fields', () => {
    const values = blankIkeGroupFormValues()
    values.dpdAction = 'restart'
    values.dpdInterval = '15'

    const ops = ikeGroupFormToOps('IKE-DEFAULT', undefined, values)
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'dead-peer-detection', 'action'], value: 'restart' },
        { op: 'set', path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'dead-peer-detection', 'interval'], value: '15' },
      ]),
    )
  })
})

describe('deleteIkeGroupOp', () => {
  it('builds a delete op', () => {
    expect(deleteIkeGroupOp('IKE-DEFAULT')).toEqual({ op: 'delete', path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT'] })
  })
})

describe('ike proposal ops', () => {
  it('always sets the tag, plus any given fields', () => {
    const ops = addIkeProposalOps('IKE-DEFAULT', '1', { dhGroup: '14', prf: 'prfsha256', encryption: 'aes256', hash: 'sha256', esn: '' })
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'proposal', '1'] },
      { op: 'set', path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'proposal', '1', 'dh-group'], value: '14' },
      { op: 'set', path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'proposal', '1', 'prf'], value: 'prfsha256' },
      { op: 'set', path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'proposal', '1', 'encryption'], value: 'aes256' },
      { op: 'set', path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'proposal', '1', 'hash'], value: 'sha256' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeIkeProposalOp('IKE-DEFAULT', '1')).toEqual({
      op: 'delete',
      path: ['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'proposal', '1'],
    })
  })
})

function emptyPeer(overrides: Partial<IPsecPeer> = {}): IPsecPeer {
  return { name: 'peer-1', ...blankIPsecPeer(), ...overrides }
}

describe('peerFormToOps', () => {
  it('always sets the tag for a brand-new peer', () => {
    expect(peerFormToOps('peer-1', undefined, blankPeerFormValues())).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1'] },
    ])
  })

  it('queues nested authentication fields', () => {
    const values = blankPeerFormValues()
    values.authMode = 'pre-shared-secret'
    values.localId = '192.0.2.1'

    const ops = peerFormToOps('peer-1', undefined, values)
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'authentication', 'mode'], value: 'pre-shared-secret' },
        { op: 'set', path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'authentication', 'local-id'], value: '192.0.2.1' },
      ]),
    )
  })

  it('queues nothing extra when editing unchanged', () => {
    const peer = emptyPeer({ connectionType: 'initiate' })
    expect(peerFormToOps('peer-1', peer, peerToFormValues(peer))).toEqual([])
  })
})

describe('deletePeerOp', () => {
  it('builds a delete op', () => {
    expect(deletePeerOp('peer-1')).toEqual({ op: 'delete', path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1'] })
  })
})

describe('tunnel ops', () => {
  it('always sets the tag, plus esp-group/protocol when given', () => {
    expect(addTunnelOps('peer-1', '0', { espGroup: 'ESP-DEFAULT', protocol: 'tcp' })).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'tunnel', '0'] },
      { op: 'set', path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'tunnel', '0', 'esp-group'], value: 'ESP-DEFAULT' },
      { op: 'set', path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'tunnel', '0', 'protocol'], value: 'tcp' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeTunnelOp('peer-1', '0')).toEqual({
      op: 'delete',
      path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'tunnel', '0'],
    })
  })
})

function emptyConnection(overrides: Partial<IPsecRemoteAccessConnection> = {}): IPsecRemoteAccessConnection {
  return { name: 'RW', ...blankIPsecRemoteAccessConnection(), ...overrides }
}

describe('connectionFormToOps', () => {
  it('always sets the tag for a brand-new connection', () => {
    expect(connectionFormToOps('RW', undefined, blankConnectionFormValues())).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'connection', 'RW'] },
    ])
  })

  it('queues a fresh pre-shared-secret when typed', () => {
    const values = blankConnectionFormValues()
    values.hasPreSharedSecret = 'super-secret'

    expect(connectionFormToOps('RW', undefined, values)).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'connection', 'RW'] },
      {
        op: 'set',
        path: ['vpn', 'ipsec', 'remote-access', 'connection', 'RW', 'authentication', 'pre-shared-secret'],
        value: 'super-secret',
      },
    ])
  })

  it('queues nothing extra when editing unchanged', () => {
    const conn = emptyConnection({ description: 'Road warriors' })
    expect(connectionFormToOps('RW', conn, connectionToFormValues(conn))).toEqual([])
  })
})

describe('deleteConnectionOp', () => {
  it('builds a delete op', () => {
    expect(deleteConnectionOp('RW')).toEqual({ op: 'delete', path: ['vpn', 'ipsec', 'remote-access', 'connection', 'RW'] })
  })
})

describe('remote-access local-user ops', () => {
  it('always sets the tag, plus a fresh password when given', () => {
    expect(addRemoteAccessLocalUserOps('RW', 'alice', 'super-secret')).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'connection', 'RW', 'authentication', 'local-users', 'username', 'alice'] },
      {
        op: 'set',
        path: ['vpn', 'ipsec', 'remote-access', 'connection', 'RW', 'authentication', 'local-users', 'username', 'alice', 'password'],
        value: 'super-secret',
      },
    ])
  })

  it('builds a remove op', () => {
    expect(removeRemoteAccessLocalUserOp('RW', 'alice')).toEqual({
      op: 'delete',
      path: ['vpn', 'ipsec', 'remote-access', 'connection', 'RW', 'authentication', 'local-users', 'username', 'alice'],
    })
  })
})

describe('remote-access pool ops', () => {
  it('always sets the tag, plus prefix/range when given', () => {
    expect(addRemoteAccessPoolOps('RW-POOL', { prefix: '10.10.0.0/24', rangeStart: '10.10.0.10', rangeStop: '10.10.0.100' })).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'pool', 'RW-POOL'] },
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'pool', 'RW-POOL', 'prefix'], value: '10.10.0.0/24' },
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'pool', 'RW-POOL', 'range', 'start'], value: '10.10.0.10' },
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'pool', 'RW-POOL', 'range', 'stop'], value: '10.10.0.100' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeRemoteAccessPoolOp('RW-POOL')).toEqual({
      op: 'delete',
      path: ['vpn', 'ipsec', 'remote-access', 'pool', 'RW-POOL'],
    })
  })
})

describe('remote-access radius server ops', () => {
  it('always sets the tag, plus key/port when given', () => {
    expect(addRemoteAccessRadiusServerOps('192.0.2.9', 'super-secret', '1812')).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'radius', 'server', '192.0.2.9'] },
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'radius', 'server', '192.0.2.9', 'key'], value: 'super-secret' },
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'radius', 'server', '192.0.2.9', 'port'], value: '1812' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeRemoteAccessRadiusServerOp('192.0.2.9')).toEqual({
      op: 'delete',
      path: ['vpn', 'ipsec', 'remote-access', 'radius', 'server', '192.0.2.9'],
    })
  })
})

describe('remoteAccessRadiusSettingsFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(remoteAccessRadiusSettingsFormToOps({}, { sourceAddress: '', timeout: '', nasIdentifier: '' })).toEqual([])
  })

  it('queues scalar fields', () => {
    const values = { sourceAddress: '192.0.2.5', timeout: '', nasIdentifier: '' }
    expect(remoteAccessRadiusSettingsFormToOps({}, values)).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'remote-access', 'radius', 'source-address'], value: '192.0.2.5' },
    ])
  })
})

describe('optionsFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(optionsFormToOps(blankIPsecOptions(), blankOptionsFormValues())).toEqual([])
  })

  it('queues flag and nested scalar fields', () => {
    const values = blankOptionsFormValues()
    values.flexvpn = true
    values.retransmissionAttempts = '10'

    expect(optionsFormToOps(blankIPsecOptions(), values)).toEqual([
      { op: 'set', path: ['vpn', 'ipsec', 'options', 'flexvpn'] },
      { op: 'set', path: ['vpn', 'ipsec', 'options', 'retransmission', 'attempts'], value: '10' },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const before = { ...blankIPsecOptions(), interface: 'eth0' }
    const values = optionsToFormValues(before)
    values.interface = ''

    expect(optionsFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['vpn', 'ipsec', 'options', 'interface'] },
    ])
  })
})
