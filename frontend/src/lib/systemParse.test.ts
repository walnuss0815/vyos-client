import { describe, expect, it } from 'vitest'
import {
  parseSystemConfig,
  publicKeyPath,
  staticHostMappingPath,
  syslogLocalPath,
  syslogRemotePath,
  systemPath,
  userPath,
} from './systemParse'

describe('parseSystemConfig - general settings', () => {
  it('returns blanks when system is absent', () => {
    const config = parseSystemConfig(undefined)
    expect(config.general).toEqual({
      hostName: undefined,
      domainName: undefined,
      domainSearch: [],
      nameServers: [],
      timeZone: undefined,
    })
    expect(config.staticHostMappings).toEqual([])
    expect(config.users).toEqual([])
    expect(config.syslog).toEqual({ local: [], remote: [] })
  })

  it('parses host-name, domain-name, time-zone', () => {
    const system = { 'host-name': 'router1', 'domain-name': 'example.com', 'time-zone': 'UTC' }
    const config = parseSystemConfig(system)
    expect(config.general.hostName).toBe('router1')
    expect(config.general.domainName).toBe('example.com')
    expect(config.general.timeZone).toBe('UTC')
  })

  it('parses multi-valued domain-search and name-server, normalizing a single value to a one-element array', () => {
    const multi = { 'domain-search': ['a.com', 'b.com'], 'name-server': ['1.1.1.1', '9.9.9.9'] }
    const single = { 'domain-search': 'a.com', 'name-server': '1.1.1.1' }
    expect(parseSystemConfig(multi).general.domainSearch).toEqual(['a.com', 'b.com'])
    expect(parseSystemConfig(multi).general.nameServers).toEqual(['1.1.1.1', '9.9.9.9'])
    expect(parseSystemConfig(single).general.domainSearch).toEqual(['a.com'])
    expect(parseSystemConfig(single).general.nameServers).toEqual(['1.1.1.1'])
  })
})

describe('parseSystemConfig - static host mappings', () => {
  it('parses addresses and aliases for each host-name', () => {
    const system = {
      'static-host-mapping': {
        'host-name': {
          fileserver: { inet: ['10.0.0.5', '10.0.0.6'], alias: ['files', 'nas'] },
          printer: { inet: '10.0.0.7' },
        },
      },
    }
    const config = parseSystemConfig(system)
    expect(config.staticHostMappings).toEqual([
      { hostName: 'fileserver', addresses: ['10.0.0.5', '10.0.0.6'], aliases: ['files', 'nas'] },
      { hostName: 'printer', addresses: ['10.0.0.7'], aliases: [] },
    ])
  })

  it('sorts by host-name', () => {
    const system = { 'static-host-mapping': { 'host-name': { zeta: {}, alpha: {} } } }
    const config = parseSystemConfig(system)
    expect(config.staticHostMappings.map((m) => m.hostName)).toEqual(['alpha', 'zeta'])
  })
})

describe('parseSystemConfig - users', () => {
  it('parses full-name, disable, and hasPassword', () => {
    const system = {
      login: {
        user: {
          alice: {
            'full-name': 'Alice Example',
            disable: {},
            authentication: { 'encrypted-password': '$6$...' },
          },
        },
      },
    }
    const config = parseSystemConfig(system)
    expect(config.users).toEqual([
      {
        username: 'alice',
        fullName: 'Alice Example',
        disabled: true,
        hasPassword: true,
        publicKeys: [],
      },
    ])
  })

  it('never exposes the real password value', () => {
    const system = {
      login: { user: { alice: { authentication: { 'encrypted-password': '$6$realhashvalue' } } } },
    }
    const config = parseSystemConfig(system)
    expect(config.users[0]).not.toHaveProperty('encryptedPassword')
    expect(config.users[0]).not.toHaveProperty('password')
  })

  it('reports hasPassword false when no password is configured', () => {
    const system = { login: { user: { alice: {} } } }
    expect(parseSystemConfig(system).users[0].hasPassword).toBe(false)
  })

  it('parses public keys, never exposing the key value', () => {
    const system = {
      login: {
        user: {
          alice: {
            authentication: {
              'public-keys': {
                'alice@laptop': { key: 'AAAAB3...', type: 'ssh-ed25519', options: 'from="10.0.0.0/24"' },
              },
            },
          },
        },
      },
    }
    const config = parseSystemConfig(system)
    expect(config.users[0].publicKeys).toEqual([
      { identifier: 'alice@laptop', type: 'ssh-ed25519', options: 'from="10.0.0.0/24"', hasKey: true },
    ])
    expect(config.users[0].publicKeys[0]).not.toHaveProperty('key')
  })

  it('sorts users by username', () => {
    const system = { login: { user: { zeta: {}, alpha: {} } } }
    const config = parseSystemConfig(system)
    expect(config.users.map((u) => u.username)).toEqual(['alpha', 'zeta'])
  })
})

describe('parseSystemConfig - syslog', () => {
  it('parses local facility rules', () => {
    const system = { syslog: { local: { facility: { all: { level: 'info' }, kern: {} } } } }
    const config = parseSystemConfig(system)
    expect(config.syslog.local).toEqual([
      { facility: 'all', level: 'info' },
      { facility: 'kern', level: undefined },
    ])
  })

  it('parses remote hosts with their own facility rules, protocol, and port', () => {
    const system = {
      syslog: {
        remote: {
          '10.0.0.1': {
            facility: { all: { level: 'debug' } },
            protocol: 'tcp',
            port: '6514',
          },
        },
      },
    }
    const config = parseSystemConfig(system)
    expect(config.syslog.remote).toEqual([
      {
        address: '10.0.0.1',
        facilities: [{ facility: 'all', level: 'debug' }],
        protocol: 'tcp',
        port: '6514',
      },
    ])
  })

  it('sorts remote hosts by address', () => {
    const system = { syslog: { remote: { '10.0.0.2': {}, '10.0.0.1': {} } } }
    const config = parseSystemConfig(system)
    expect(config.syslog.remote.map((r) => r.address)).toEqual(['10.0.0.1', '10.0.0.2'])
  })
})

describe('path builders', () => {
  it('builds a system path', () => {
    expect(systemPath('host-name')).toEqual(['system', 'host-name'])
  })

  it('builds a static-host-mapping path', () => {
    expect(staticHostMappingPath('fileserver', 'inet')).toEqual([
      'system',
      'static-host-mapping',
      'host-name',
      'fileserver',
      'inet',
    ])
  })

  it('builds a user path', () => {
    expect(userPath('alice', 'full-name')).toEqual(['system', 'login', 'user', 'alice', 'full-name'])
  })

  it('builds a public-key path', () => {
    expect(publicKeyPath('alice', 'alice@laptop', 'type')).toEqual([
      'system',
      'login',
      'user',
      'alice',
      'authentication',
      'public-keys',
      'alice@laptop',
      'type',
    ])
  })

  it('builds syslog local/remote paths', () => {
    expect(syslogLocalPath('facility', 'all', 'level')).toEqual([
      'system',
      'syslog',
      'local',
      'facility',
      'all',
      'level',
    ])
    expect(syslogRemotePath('10.0.0.1', 'port')).toEqual(['system', 'syslog', 'remote', '10.0.0.1', 'port'])
  })
})
