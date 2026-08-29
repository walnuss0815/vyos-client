import { describe, expect, it } from 'vitest'
import {
  parseSNMPConfig,
  snmpCommunityPath,
  snmpListenAddressPath,
  snmpPath,
  snmpTrapTargetPath,
  snmpV3GroupPath,
  snmpV3Path,
  snmpV3TrapTargetPath,
  snmpV3UserPath,
  snmpV3ViewOidPath,
  snmpV3ViewPath,
} from './serviceSnmpParse'

describe('parseSNMPConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseSNMPConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseSNMPConfig({}).enabled).toBe(true)
  })

  it('parses communities with authorization, clients, and networks', () => {
    const snmp = {
      community: {
        public: { authorization: 'ro', client: ['192.0.2.1'], network: ['192.0.2.0/24'] },
      },
    }
    const config = parseSNMPConfig(snmp)
    expect(config.communities).toEqual([
      { name: 'public', authorization: 'ro', clients: ['192.0.2.1'], networks: ['192.0.2.0/24'] },
    ])
  })

  it('parses contact, location, description, trap-source, and protocol', () => {
    const snmp = { contact: 'admin@example.com', location: 'DC1', description: 'Main router', 'trap-source': '192.0.2.1', protocol: 'tcp' }
    const config = parseSNMPConfig(snmp)
    expect(config.contact).toBe('admin@example.com')
    expect(config.location).toBe('DC1')
    expect(config.description).toBe('Main router')
    expect(config.trapSource).toBe('192.0.2.1')
    expect(config.protocol).toBe('tcp')
  })

  it('parses listen-address and trap-target with their port children', () => {
    const snmp = {
      'listen-address': { '192.0.2.1': { port: '1161' } },
      'trap-target': { '192.0.2.2': { community: 'public', port: '1162' } },
    }
    const config = parseSNMPConfig(snmp)
    expect(config.listenAddresses).toEqual([{ address: '192.0.2.1', port: '1161' }])
    expect(config.trapTargets).toEqual([{ address: '192.0.2.2', hasCommunity: true, port: '1162' }])
  })

  it('never leaks the trap-target community value, matching write-only masked-credential convention', () => {
    const snmp = { 'trap-target': { '192.0.2.2': { community: 'super-secret-community' } } }
    const config = parseSNMPConfig(snmp)
    expect(JSON.stringify(config)).not.toContain('super-secret-community')
  })

  it('sorts communities, listen addresses, and trap targets', () => {
    const snmp = {
      community: { zeta: {}, alpha: {} },
      'listen-address': { '9.9.9.9': {}, '1.1.1.1': {} },
    }
    const config = parseSNMPConfig(snmp)
    expect(config.communities.map((c) => c.name)).toEqual(['alpha', 'zeta'])
    expect(config.listenAddresses.map((l) => l.address)).toEqual(['1.1.1.1', '9.9.9.9'])
  })
})

describe('parseSNMPConfig - v3', () => {
  it('returns a blank v3 config when absent', () => {
    expect(parseSNMPConfig({}).v3).toEqual({ groups: [], users: [], views: [], trapTargets: [] })
  })

  it('parses engineid, groups, and users with auth/privacy pairs', () => {
    const snmp = {
      v3: {
        engineid: '0102030405060708090a0b0c0d0e0f10',
        group: { admins: { mode: 'rw', seclevel: 'priv', view: 'all' } },
        user: {
          alice: {
            auth: { 'plaintext-password': 'super-secret1', type: 'sha' },
            group: 'admins',
            mode: 'rw',
            privacy: { 'encrypted-password': 'abc123', type: 'aes' },
          },
        },
      },
    }
    const config = parseSNMPConfig(snmp)
    expect(config.v3.engineId).toBe('0102030405060708090a0b0c0d0e0f10')
    expect(config.v3.groups).toEqual([{ name: 'admins', mode: 'rw', seclevel: 'priv', view: 'all' }])
    expect(config.v3.users).toEqual([
      {
        name: 'alice',
        auth: { hasPassword: true, type: 'sha' },
        group: 'admins',
        mode: 'rw',
        privacy: { hasPassword: true, type: 'aes' },
      },
    ])
  })

  it('never leaks v3 password values, matching write-only masked-credential convention', () => {
    const snmp = {
      v3: { user: { alice: { auth: { 'plaintext-password': 'super-secret1' } } } },
    }
    const config = parseSNMPConfig(snmp)
    expect(JSON.stringify(config)).not.toContain('super-secret1')
  })

  it('parses views with OID entries', () => {
    const snmp = {
      v3: { view: { all: { oid: { '1.3.6.1': { exclude: ['1.3.6.1.2'], mask: 'ff.ff' } } } } },
    }
    const config = parseSNMPConfig(snmp)
    expect(config.v3.views).toEqual([
      { name: 'all', oids: [{ oid: '1.3.6.1', exclude: ['1.3.6.1.2'], mask: 'ff.ff' }] },
    ])
  })

  it('parses v3 trap-targets with auth/privacy/port/protocol/type/user', () => {
    const snmp = {
      v3: {
        'trap-target': {
          '192.0.2.3': {
            auth: { 'plaintext-password': 'secret', type: 'sha' },
            privacy: { 'plaintext-password': 'secret2', type: 'aes' },
            port: '1162',
            protocol: 'tcp',
            type: 'trap',
            user: 'alice',
          },
        },
      },
    }
    const config = parseSNMPConfig(snmp)
    expect(config.v3.trapTargets).toEqual([
      {
        address: '192.0.2.3',
        auth: { hasPassword: true, type: 'sha' },
        privacy: { hasPassword: true, type: 'aes' },
        port: '1162',
        protocol: 'tcp',
        type: 'trap',
        user: 'alice',
      },
    ])
  })

  it('sorts groups, users, views, and trap-targets by name/address', () => {
    const snmp = {
      v3: {
        group: { zeta: {}, alpha: {} },
        user: { zeta: {}, alpha: {} },
        view: { zeta: {}, alpha: {} },
        'trap-target': { '9.9.9.9': {}, '1.1.1.1': {} },
      },
    }
    const config = parseSNMPConfig(snmp)
    expect(config.v3.groups.map((g) => g.name)).toEqual(['alpha', 'zeta'])
    expect(config.v3.users.map((u) => u.name)).toEqual(['alpha', 'zeta'])
    expect(config.v3.views.map((v) => v.name)).toEqual(['alpha', 'zeta'])
    expect(config.v3.trapTargets.map((t) => t.address)).toEqual(['1.1.1.1', '9.9.9.9'])
  })
})

describe('path builders', () => {
  it('builds base and community paths', () => {
    expect(snmpPath('contact')).toEqual(['service', 'snmp', 'contact'])
    expect(snmpCommunityPath('public', 'authorization')).toEqual([
      'service',
      'snmp',
      'community',
      'public',
      'authorization',
    ])
  })

  it('builds listen-address and trap-target paths', () => {
    expect(snmpListenAddressPath('192.0.2.1', 'port')).toEqual([
      'service',
      'snmp',
      'listen-address',
      '192.0.2.1',
      'port',
    ])
    expect(snmpTrapTargetPath('192.0.2.2', 'community')).toEqual([
      'service',
      'snmp',
      'trap-target',
      '192.0.2.2',
      'community',
    ])
  })

  it('builds v3 paths', () => {
    expect(snmpV3Path('engineid')).toEqual(['service', 'snmp', 'v3', 'engineid'])
    expect(snmpV3GroupPath('admins', 'mode')).toEqual(['service', 'snmp', 'v3', 'group', 'admins', 'mode'])
    expect(snmpV3UserPath('alice', 'group')).toEqual(['service', 'snmp', 'v3', 'user', 'alice', 'group'])
    expect(snmpV3ViewPath('all', 'oid')).toEqual(['service', 'snmp', 'v3', 'view', 'all', 'oid'])
    expect(snmpV3ViewOidPath('all', '1.3.6.1', 'mask')).toEqual([
      'service',
      'snmp',
      'v3',
      'view',
      'all',
      'oid',
      '1.3.6.1',
      'mask',
    ])
    expect(snmpV3TrapTargetPath('192.0.2.3', 'port')).toEqual([
      'service',
      'snmp',
      'v3',
      'trap-target',
      '192.0.2.3',
      'port',
    ])
  })
})
