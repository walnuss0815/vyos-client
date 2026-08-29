import { describe, expect, it } from 'vitest'
import {
  openconnectAccountingRadiusServerPath,
  openconnectAuthPath,
  openconnectAuthRadiusServerPath,
  openconnectLocalUserPath,
  openconnectNetworkSettingsPath,
  openconnectPath,
  openconnectSslPath,
  parseOpenconnectConfig,
} from './vpnOpenconnectParse'

describe('parseOpenconnectConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseOpenconnectConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseOpenconnectConfig({}).enabled).toBe(true)
  })

  it('parses accounting radius mode/servers without leaking keys', () => {
    const top = {
      accounting: {
        mode: { radius: null },
        radius: { server: { '192.0.2.1': { key: 'super-secret-acct-key', 'acct-port': '1813' } } },
      },
    }
    const config = parseOpenconnectConfig(top)
    expect(config.accounting.radiusEnabled).toBe(true)
    expect(config.accounting.radiusServers).toEqual([
      { address: '192.0.2.1', disabled: false, hasKey: true, port: '1813' },
    ])
    expect(JSON.stringify(config)).not.toContain('super-secret-acct-key')
  })

  it('parses authentication mode (local/radius/certificate) and groups', () => {
    const top = {
      authentication: {
        mode: { local: 'password-otp', radius: null, certificate: { 'user-identifier-field': 'cn' } },
        group: ['sales[Sales Team]', 'engineering'],
      },
    }
    const config = parseOpenconnectConfig(top)
    expect(config.authentication.localMode).toBe('password-otp')
    expect(config.authentication.radiusEnabled).toBe(true)
    expect(config.authentication.certificateUserIdentifierField).toBe('cn')
    expect(config.authentication.groups).toEqual(['sales[Sales Team]', 'engineering'])
  })

  it('parses local users including OTP settings, without leaking password or OTP key', () => {
    const top = {
      authentication: {
        'local-users': {
          username: {
            alice: {
              password: 'super-secret-password',
              otp: { key: 'deadbeefdeadbeefdeadbeef', 'otp-length': '8', interval: '60', 'token-type': 'hotp-event' },
            },
            bob: { disable: null },
          },
        },
      },
    }
    const config = parseOpenconnectConfig(top)
    expect(config.authentication.localUsers).toEqual([
      {
        username: 'alice',
        disabled: false,
        hasPassword: true,
        otp: { hasKey: true, otpLength: '8', interval: '60', tokenType: 'hotp-event' },
      },
      {
        username: 'bob',
        disabled: true,
        hasPassword: false,
        otp: { hasKey: false, otpLength: undefined, interval: undefined, tokenType: undefined },
      },
    ])
    expect(JSON.stringify(config)).not.toContain('super-secret-password')
    expect(JSON.stringify(config)).not.toContain('deadbeefdeadbeefdeadbeef')
  })

  it('parses authentication radius servers, timeout, groupconfig, without leaking keys', () => {
    const top = {
      authentication: {
        radius: {
          server: { '192.0.2.9': { key: 'super-secret-auth-key', port: '1812' } },
          timeout: '5',
          groupconfig: null,
        },
      },
    }
    const config = parseOpenconnectConfig(top)
    expect(config.authentication.radius).toEqual({
      servers: [{ address: '192.0.2.9', disabled: false, hasKey: true, port: '1812' }],
      timeout: '5',
      groupconfig: true,
    })
    expect(JSON.stringify(config)).not.toContain('super-secret-auth-key')
  })

  it('parses listen-address, listen-ports, http-security-headers, tls-version-min', () => {
    const top = {
      'listen-address': '203.0.113.1',
      'listen-ports': { tcp: '8443', udp: '8443' },
      'http-security-headers': null,
      'tls-version-min': '1.3',
    }
    const config = parseOpenconnectConfig(top)
    expect(config.listenAddress).toBe('203.0.113.1')
    expect(config.listenPorts).toEqual({ tcp: '8443', udp: '8443' })
    expect(config.httpSecurityHeaders).toBe(true)
    expect(config.tlsVersionMin).toBe('1.3')
  })

  it('parses ssl without leaking the passphrase', () => {
    const top = { ssl: { 'ca-certificate': ['my-ca-1', 'my-ca-2'], certificate: 'my-cert', passphrase: 'super-secret-pass' } }
    const config = parseOpenconnectConfig(top)
    expect(config.ssl).toEqual({ caCertificates: ['my-ca-1', 'my-ca-2'], certificate: 'my-cert', hasPassphrase: true })
    expect(JSON.stringify(config)).not.toContain('super-secret-pass')
  })

  it('parses network-settings including the single (non-tag-keyed) client-ipv6-pool', () => {
    const top = {
      'network-settings': {
        'push-route': ['10.0.0.0/8'],
        'client-ip-settings': { subnet: '192.0.2.0/24' },
        'client-ipv6-pool': { prefix: '2001:db8::/64', mask: '80' },
        'name-server': ['192.0.2.1'],
        'split-dns': ['example.com'],
        'tunnel-all-dns': 'yes',
      },
    }
    const config = parseOpenconnectConfig(top)
    expect(config.networkSettings).toEqual({
      pushRoutes: ['10.0.0.0/8'],
      clientIpv4Subnet: '192.0.2.0/24',
      clientIpv6Pool: { prefix: '2001:db8::/64', mask: '80' },
      nameServers: ['192.0.2.1'],
      splitDns: ['example.com'],
      tunnelAllDns: 'yes',
    })
  })

  it('parses script connect/disconnect', () => {
    const top = { script: { connect: '/config/scripts/connect.sh', disconnect: '/config/scripts/disconnect.sh' } }
    const config = parseOpenconnectConfig(top)
    expect(config.script).toEqual({ connect: '/config/scripts/connect.sh', disconnect: '/config/scripts/disconnect.sh' })
  })
})

describe('openconnect path builders', () => {
  it('openconnectPath is always vpn/openconnect', () => {
    expect(openconnectPath()).toEqual(['vpn', 'openconnect'])
    expect(openconnectPath('foo')).toEqual(['vpn', 'openconnect', 'foo'])
  })

  it('builds accounting/authentication radius server paths', () => {
    expect(openconnectAccountingRadiusServerPath('192.0.2.1')).toEqual([
      'vpn', 'openconnect', 'accounting', 'radius', 'server', '192.0.2.1',
    ])
    expect(openconnectAuthPath()).toEqual(['vpn', 'openconnect', 'authentication'])
    expect(openconnectAuthRadiusServerPath('192.0.2.1')).toEqual([
      'vpn', 'openconnect', 'authentication', 'radius', 'server', '192.0.2.1',
    ])
  })

  it('builds local user path', () => {
    expect(openconnectLocalUserPath('alice')).toEqual([
      'vpn', 'openconnect', 'authentication', 'local-users', 'username', 'alice',
    ])
  })

  it('builds ssl and network-settings paths', () => {
    expect(openconnectSslPath()).toEqual(['vpn', 'openconnect', 'ssl'])
    expect(openconnectNetworkSettingsPath()).toEqual(['vpn', 'openconnect', 'network-settings'])
  })
})
