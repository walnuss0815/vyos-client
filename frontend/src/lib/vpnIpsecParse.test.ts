import { describe, expect, it } from 'vitest'
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
  parseIPsecConfig,
} from './vpnIpsecParse'

describe('parseIPsecConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseIPsecConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseIPsecConfig({}).enabled).toBe(true)
  })

  it('parses global psk/ppk stores without leaking secret values', () => {
    const ipsec = {
      authentication: {
        psk: { 'peer-1': { id: ['192.0.2.1', '192.0.2.2'], secret: 'super-secret-psk', 'secret-type': 'plaintext' } },
        ppk: { 'ppk-1': { id: ['192.0.2.1'], secret: 'super-secret-ppk' } },
      },
    }
    const config = parseIPsecConfig(ipsec)
    expect(config.psks).toEqual([
      { name: 'peer-1', ids: ['192.0.2.1', '192.0.2.2'], hasSecret: true, secretType: 'plaintext', dhcpInterfaces: [] },
    ])
    expect(config.ppks).toEqual([{ name: 'ppk-1', ids: ['192.0.2.1'], hasSecret: true, secretType: undefined }])
    expect(JSON.stringify(config)).not.toContain('super-secret-psk')
    expect(JSON.stringify(config)).not.toContain('super-secret-ppk')
  })

  it('parses esp-group with proposals', () => {
    const ipsec = {
      'esp-group': {
        'ESP-DEFAULT': {
          compression: {},
          lifetime: '1800',
          mode: 'tunnel',
          pfs: 'dh-group14',
          proposal: { '1': { encryption: 'aes256', hash: 'sha256', esn: 'disabled' } },
        },
      },
    }
    const config = parseIPsecConfig(ipsec)
    expect(config.espGroups).toEqual([
      {
        name: 'ESP-DEFAULT',
        compression: true,
        lifetime: '1800',
        lifeBytes: undefined,
        lifePackets: undefined,
        disableRekey: false,
        mode: 'tunnel',
        pfs: 'dh-group14',
        proposals: [{ id: '1', encryption: 'aes256', hash: 'sha256', esn: 'disabled' }],
      },
    ])
  })

  it('parses ike-group with dead-peer-detection and proposals', () => {
    const ipsec = {
      'ike-group': {
        'IKE-DEFAULT': {
          'close-action': 'start',
          'dead-peer-detection': { action: 'restart', interval: '15', timeout: '60' },
          'ikev2-reauth': {},
          'key-exchange': 'ikev2',
          proposal: { '1': { 'dh-group': '14', prf: 'prfsha256', encryption: 'aes256', hash: 'sha256' } },
        },
      },
    }
    const config = parseIPsecConfig(ipsec)
    const group = config.ikeGroups[0]
    expect(group).toMatchObject({
      name: 'IKE-DEFAULT',
      closeAction: 'start',
      dpdAction: 'restart',
      dpdInterval: '15',
      dpdTimeout: '60',
      ikev2Reauth: true,
      keyExchange: 'ikev2',
    })
    expect(group.proposals).toEqual([{ id: '1', dhGroup: '14', prf: 'prfsha256', encryption: 'aes256', hash: 'sha256', esn: undefined }])
  })

  it('parses site-to-site peers with authentication, tunnels, and vti', () => {
    const ipsec = {
      'site-to-site': {
        peer: {
          'peer_51-105-0-1': {
            authentication: { mode: 'pre-shared-secret', 'local-id': '192.0.2.10', 'remote-id': '51.105.0.1' },
            'connection-type': 'initiate',
            'default-esp-group': 'ESP-DEFAULT',
            'ike-group': 'IKE-DEFAULT',
            'local-address': '192.0.2.10',
            'remote-address': ['51.105.0.1'],
            tunnel: {
              '0': { local: { prefix: ['192.168.1.0/24'] }, remote: { prefix: ['10.0.0.0/24'] } },
            },
          },
        },
      },
    }
    const config = parseIPsecConfig(ipsec)
    const peer = config.siteToSitePeers[0]
    expect(peer.name).toBe('peer_51-105-0-1')
    expect(peer.authentication.mode).toBe('pre-shared-secret')
    expect(peer.authentication.localId).toBe('192.0.2.10')
    expect(peer.connectionType).toBe('initiate')
    expect(peer.remoteAddresses).toEqual(['51.105.0.1'])
    expect(peer.tunnels).toEqual([
      { id: '0', disabled: false, espGroup: undefined, localPort: undefined, localPrefixes: ['192.168.1.0/24'], protocol: undefined, priority: undefined, remotePort: undefined, remotePrefixes: ['10.0.0.0/24'] },
    ])
  })

  it('parses a vti-bound peer', () => {
    const ipsec = {
      'site-to-site': {
        peer: {
          'peer-vti': {
            vti: { bind: 'vti0', 'esp-group': 'ESP-DEFAULT', 'traffic-selector': { local: { prefix: ['10.0.0.0/24'] }, remote: { prefix: ['10.0.1.0/24'] } } },
          },
        },
      },
    }
    const config = parseIPsecConfig(ipsec)
    expect(config.siteToSitePeers[0].vti).toEqual({
      bind: 'vti0',
      espGroup: 'ESP-DEFAULT',
      localPrefixes: ['10.0.0.0/24'],
      remotePrefixes: ['10.0.1.0/24'],
    })
  })

  it('parses remote-access connections, local-users, pools, and radius without leaking secrets', () => {
    const ipsec = {
      'remote-access': {
        connection: {
          RW: {
            authentication: {
              'client-mode': 'eap-mschapv2',
              'local-users': { username: { alice: { password: 'super-secret-user' } } },
              'pre-shared-secret': 'super-secret-psk',
            },
            pool: ['RW-POOL'],
          },
        },
        pool: { 'RW-POOL': { prefix: '10.10.0.0/24', 'name-server': ['192.0.2.1'] } },
        radius: {
          'source-address': '192.0.2.5',
          server: { '192.0.2.9': { key: 'super-secret-radius', port: '1812' } },
        },
      },
    }
    const config = parseIPsecConfig(ipsec)
    expect(config.remoteAccess.connections[0].authentication.localUsers).toEqual([
      { username: 'alice', disabled: false, hasPassword: true },
    ])
    expect(config.remoteAccess.connections[0].authentication.hasPreSharedSecret).toBe(true)
    expect(config.remoteAccess.pools[0]).toMatchObject({ name: 'RW-POOL', prefix: '10.10.0.0/24', nameServers: ['192.0.2.1'] })
    expect(config.remoteAccess.radius.servers).toEqual([
      { address: '192.0.2.9', disabled: false, hasKey: true, port: '1812', disableAccounting: false },
    ])
    expect(JSON.stringify(config)).not.toContain('super-secret-user')
    expect(JSON.stringify(config)).not.toContain('super-secret-psk')
    expect(JSON.stringify(config)).not.toContain('super-secret-radius')
  })

  it('parses options', () => {
    const ipsec = {
      options: {
        'disable-route-autoinstall': {},
        flexvpn: {},
        retransmission: { attempts: '10', base: '2.0', timeout: '5' },
      },
    }
    const config = parseIPsecConfig(ipsec)
    expect(config.options).toEqual({
      disableRouteAutoinstall: true,
      flexvpn: true,
      interface: undefined,
      virtualIp: false,
      retransmissionAttempts: '10',
      retransmissionBase: '2.0',
      retransmissionTimeout: '5',
    })
  })

  it('sorts psks, esp-groups, ike-groups, peers, connections, and pools by name', () => {
    const ipsec = {
      authentication: { psk: { zeta: {}, alpha: {} } },
      'esp-group': { zeta: {}, alpha: {} },
      'ike-group': { zeta: {}, alpha: {} },
      'site-to-site': { peer: { zeta: {}, alpha: {} } },
      'remote-access': { connection: { zeta: {}, alpha: {} }, pool: { zeta: {}, alpha: {} } },
    }
    const config = parseIPsecConfig(ipsec)
    expect(config.psks.map((p) => p.name)).toEqual(['alpha', 'zeta'])
    expect(config.espGroups.map((g) => g.name)).toEqual(['alpha', 'zeta'])
    expect(config.ikeGroups.map((g) => g.name)).toEqual(['alpha', 'zeta'])
    expect(config.siteToSitePeers.map((p) => p.name)).toEqual(['alpha', 'zeta'])
    expect(config.remoteAccess.connections.map((c) => c.name)).toEqual(['alpha', 'zeta'])
    expect(config.remoteAccess.pools.map((p) => p.name)).toEqual(['alpha', 'zeta'])
  })
})

describe('path builders', () => {
  it('builds base, auth, and crypto group paths', () => {
    expect(ipsecPath('disable-uniqreqids')).toEqual(['vpn', 'ipsec', 'disable-uniqreqids'])
    expect(ipsecPskPath('peer-1', 'secret')).toEqual(['vpn', 'ipsec', 'authentication', 'psk', 'peer-1', 'secret'])
    expect(ipsecPpkPath('ppk-1', 'secret')).toEqual(['vpn', 'ipsec', 'authentication', 'ppk', 'ppk-1', 'secret'])
    expect(ipsecEspGroupPath('ESP-DEFAULT', 'mode')).toEqual(['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'mode'])
    expect(ipsecEspProposalPath('ESP-DEFAULT', '1', 'encryption')).toEqual([
      'vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'proposal', '1', 'encryption',
    ])
    expect(ipsecIkeGroupPath('IKE-DEFAULT', 'lifetime')).toEqual(['vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'lifetime'])
    expect(ipsecIkeProposalPath('IKE-DEFAULT', '1', 'dh-group')).toEqual([
      'vpn', 'ipsec', 'ike-group', 'IKE-DEFAULT', 'proposal', '1', 'dh-group',
    ])
  })

  it('builds site-to-site peer and tunnel paths', () => {
    expect(ipsecPeerPath('peer-1', 'connection-type')).toEqual(['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'connection-type'])
    expect(ipsecTunnelPath('peer-1', '0', 'protocol')).toEqual([
      'vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'tunnel', '0', 'protocol',
    ])
  })

  it('builds remote-access paths', () => {
    expect(ipsecRemoteAccessPath('dhcp')).toEqual(['vpn', 'ipsec', 'remote-access', 'dhcp'])
    expect(ipsecConnectionPath('RW', 'disable')).toEqual(['vpn', 'ipsec', 'remote-access', 'connection', 'RW', 'disable'])
    expect(ipsecRemoteAccessPoolPath('RW-POOL', 'prefix')).toEqual([
      'vpn', 'ipsec', 'remote-access', 'pool', 'RW-POOL', 'prefix',
    ])
    expect(ipsecRemoteAccessRadiusServerPath('192.0.2.9', 'port')).toEqual([
      'vpn', 'ipsec', 'remote-access', 'radius', 'server', '192.0.2.9', 'port',
    ])
  })

  it('builds an options path', () => {
    expect(ipsecOptionsPath('flexvpn')).toEqual(['vpn', 'ipsec', 'options', 'flexvpn'])
  })
})
