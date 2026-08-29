import { describe, expect, it } from 'vitest'
import {
  accelPppAuthPath,
  accelPppBasePath,
  accelPppClientIpPoolPath,
  accelPppClientIpv6PoolPath,
  accelPppClientIpv6PoolPrefixPath,
  accelPppExtendedScriptsPath,
  accelPppKindPath,
  accelPppLimitsPath,
  accelPppLocalUserPath,
  accelPppPppOptionsPath,
  accelPppRadiusServerPath,
  l2tpIpsecAuthPath,
  l2tpIpsecSettingsPath,
  l2tpLnsPath,
  parseAccelPppConfig,
  sstpSslPath,
} from './vpnAccelPppParse'

describe('parseAccelPppConfig', () => {
  it('returns a blank, disabled config when the top-level node is absent', () => {
    expect(parseAccelPppConfig('l2tp', undefined).enabled).toBe(false)
    expect(parseAccelPppConfig('pptp', undefined).enabled).toBe(false)
    expect(parseAccelPppConfig('sstp', undefined).enabled).toBe(false)
  })

  it('returns a blank, disabled config when the remote-access wrapper is absent (l2tp/pptp)', () => {
    expect(parseAccelPppConfig('l2tp', {}).enabled).toBe(false)
    expect(parseAccelPppConfig('pptp', {}).enabled).toBe(false)
  })

  it('marks sstp enabled directly, with no remote-access wrapper needed', () => {
    expect(parseAccelPppConfig('sstp', {}).enabled).toBe(true)
  })

  it('marks l2tp/pptp enabled once remote-access is present, even if empty', () => {
    expect(parseAccelPppConfig('l2tp', { 'remote-access': {} }).enabled).toBe(true)
    expect(parseAccelPppConfig('pptp', { 'remote-access': {} }).enabled).toBe(true)
  })

  it('parses authentication mode/protocols/local-users without leaking passwords', () => {
    const top = {
      'remote-access': {
        authentication: {
          mode: 'local',
          protocols: ['pap', 'chap'],
          'local-users': {
            username: {
              alice: { password: 'super-secret', 'static-ip': '192.0.2.10', 'rate-limit': { upload: '1000', download: '2000' } },
              bob: { disable: null },
            },
          },
        },
      },
    }
    const config = parseAccelPppConfig('l2tp', top)
    expect(config.authentication.mode).toBe('local')
    expect(config.authentication.protocols).toEqual(['pap', 'chap'])
    expect(config.authentication.localUsers).toEqual([
      { username: 'alice', disabled: false, hasPassword: true, staticIp: '192.0.2.10', rateLimitUpload: '1000', rateLimitDownload: '2000' },
      { username: 'bob', disabled: true, hasPassword: false, staticIp: undefined, rateLimitUpload: undefined, rateLimitDownload: undefined },
    ])
    expect(JSON.stringify(config)).not.toContain('super-secret')
  })

  it('parses radius servers without leaking keys', () => {
    const top = {
      'remote-access': {
        authentication: {
          radius: {
            server: { '192.0.2.1': { key: 'super-secret-key', port: '1812' } },
            'accounting-interim-interval': '60',
            timeout: '5',
            'nas-identifier': 'vyos',
          },
        },
      },
    }
    const config = parseAccelPppConfig('pptp', top)
    expect(config.authentication.radius).toEqual({
      mode: undefined,
      servers: [{ address: '192.0.2.1', hasKey: true, port: '1812' }],
      accountingInterimInterval: '60',
      timeout: '5',
      nasIdentifier: 'vyos',
    })
    expect(JSON.stringify(config)).not.toContain('super-secret-key')
  })

  it('parses client-ip-pool and client-ipv6-pool', () => {
    const top = {
      'remote-access': {
        'client-ip-pool': { 'POOL-A': { range: ['192.0.2.0/24'], 'next-pool': 'POOL-B' } },
        'client-ipv6-pool': { 'POOL6-A': { prefix: { '2001:db8::/64': { mask: '80' } } } },
      },
    }
    const config = parseAccelPppConfig('l2tp', top)
    expect(config.clientIpPools).toEqual([{ name: 'POOL-A', ranges: ['192.0.2.0/24'], nextPool: 'POOL-B' }])
    expect(config.clientIpv6Pools).toEqual([
      { name: 'POOL6-A', prefixes: [{ prefix: '2001:db8::/64', mask: '80' }] },
    ])
  })

  it('parses ppp-options, limits, extended-scripts, shaper, snmp, log, wins-server, name-server', () => {
    const top = {
      'remote-access': {
        'ppp-options': {
          'min-mtu': '1200',
          mru: '1400',
          'disable-ccp': null,
          mppe: 'require',
          'lcp-echo-interval': '30',
          'lcp-echo-failure': '3',
          'lcp-echo-timeout': '60',
          ipv4: 'require',
          ipv6: 'allow',
        },
        limits: { 'connection-limit': '1/min', burst: '5', timeout: '10' },
        'extended-scripts': { 'on-up': '/tmp/up.sh', 'on-down': '/tmp/down.sh' },
        shaper: { fwmark: '10' },
        snmp: { 'master-agent': null },
        log: { level: '4' },
        'wins-server': ['192.0.2.53'],
        'name-server': ['192.0.2.1', '192.0.2.2'],
        'gateway-address': '192.0.2.1',
        'max-concurrent-sessions': '100',
        mtu: '1436',
        'thread-count': 'all',
        'default-pool': 'POOL-A',
        'default-ipv6-pool': 'POOL6-A',
        description: 'test l2tp server',
        'outside-address': '203.0.113.1',
      },
    }
    const config = parseAccelPppConfig('l2tp', top)
    expect(config.pppOptions).toEqual({
      minMtu: '1200',
      mru: '1400',
      disableCcp: true,
      mppe: 'require',
      lcpEchoInterval: '30',
      lcpEchoFailure: '3',
      lcpEchoTimeout: '60',
      ipv4: 'require',
      ipv6: 'allow',
    })
    expect(config.limits).toEqual({ connectionLimit: '1/min', burst: '5', timeout: '10' })
    expect(config.extendedScripts).toEqual({ onPreUp: undefined, onUp: '/tmp/up.sh', onDown: '/tmp/down.sh', onChange: undefined })
    expect(config.shaperFwmark).toBe('10')
    expect(config.snmpMasterAgent).toBe(true)
    expect(config.logLevel).toBe('4')
    expect(config.winsServers).toEqual(['192.0.2.53'])
    expect(config.nameServers).toEqual(['192.0.2.1', '192.0.2.2'])
    expect(config.gatewayAddress).toBe('192.0.2.1')
    expect(config.maxConcurrentSessions).toBe('100')
    expect(config.mtu).toBe('1436')
    expect(config.threadCount).toBe('all')
    expect(config.defaultPool).toBe('POOL-A')
    expect(config.defaultIpv6Pool).toBe('POOL6-A')
    expect(config.description).toBe('test l2tp server')
    expect(config.outsideAddress).toBe('203.0.113.1')
  })

  it('parses L2TP-only ipsec-settings and lns, without leaking secrets', () => {
    const top = {
      'remote-access': {
        'ipsec-settings': {
          authentication: { mode: 'pre-shared-secret', 'pre-shared-secret': 'super-secret-ipsec' },
          'ike-lifetime': '3600',
          lifetime: '3600',
        },
        lns: { 'shared-secret': 'super-secret-lns', 'host-name': 'lns.example.com' },
      },
    }
    const config = parseAccelPppConfig('l2tp', top)
    expect(config.ipsecSettings).toEqual({
      authMode: 'pre-shared-secret',
      hasPresharedSecret: true,
      ikeLifetime: '3600',
      lifetime: '3600',
    })
    expect(config.lns).toEqual({ hasSharedSecret: true, hostName: 'lns.example.com' })
    expect(JSON.stringify(config)).not.toContain('super-secret-ipsec')
    expect(JSON.stringify(config)).not.toContain('super-secret-lns')
  })

  it('does not populate L2TP-only fields for pptp/sstp', () => {
    const pptpConfig = parseAccelPppConfig('pptp', { 'remote-access': {} })
    expect(pptpConfig.ipsecSettings).toEqual({ hasPresharedSecret: false })
    expect(pptpConfig.lns).toEqual({ hasSharedSecret: false })
    expect(pptpConfig.outsideAddress).toBeUndefined()

    const sstpConfig = parseAccelPppConfig('sstp', {})
    expect(sstpConfig.ipsecSettings).toEqual({ hasPresharedSecret: false })
    expect(sstpConfig.lns).toEqual({ hasSharedSecret: false })
    expect(sstpConfig.outsideAddress).toBeUndefined()
  })

  it('parses SSTP-only ssl/port/host-name and has no remote-access wrapper', () => {
    const top = {
      ssl: { 'ca-certificate': 'my-ca', certificate: 'my-cert' },
      port: '8443',
      'host-name': 'vpn.example.com',
    }
    const config = parseAccelPppConfig('sstp', top)
    expect(config.ssl).toEqual({ caCertificate: 'my-ca', certificate: 'my-cert' })
    expect(config.port).toBe('8443')
    expect(config.hostName).toBe('vpn.example.com')
  })

  it('does not populate SSTP-only fields for l2tp/pptp', () => {
    const config = parseAccelPppConfig('l2tp', { 'remote-access': {} })
    expect(config.ssl).toEqual({})
    expect(config.port).toBeUndefined()
    expect(config.hostName).toBeUndefined()
  })
})

describe('accel-ppp path builders', () => {
  it('accelPppKindPath is always vpn/<kind>', () => {
    expect(accelPppKindPath('l2tp')).toEqual(['vpn', 'l2tp'])
    expect(accelPppKindPath('pptp', 'foo')).toEqual(['vpn', 'pptp', 'foo'])
  })

  it('accelPppBasePath wraps l2tp/pptp under remote-access but not sstp', () => {
    expect(accelPppBasePath('l2tp')).toEqual(['vpn', 'l2tp', 'remote-access'])
    expect(accelPppBasePath('pptp', 'foo')).toEqual(['vpn', 'pptp', 'remote-access', 'foo'])
    expect(accelPppBasePath('sstp', 'foo')).toEqual(['vpn', 'sstp', 'foo'])
  })

  it('builds authentication and sub-paths', () => {
    expect(accelPppAuthPath('l2tp')).toEqual(['vpn', 'l2tp', 'remote-access', 'authentication'])
    expect(accelPppLocalUserPath('l2tp', 'alice')).toEqual([
      'vpn', 'l2tp', 'remote-access', 'authentication', 'local-users', 'username', 'alice',
    ])
    expect(accelPppRadiusServerPath('sstp', '192.0.2.1')).toEqual([
      'vpn', 'sstp', 'authentication', 'radius', 'server', '192.0.2.1',
    ])
  })

  it('builds client ip pool paths', () => {
    expect(accelPppClientIpPoolPath('pptp', 'POOL-A')).toEqual(['vpn', 'pptp', 'remote-access', 'client-ip-pool', 'POOL-A'])
    expect(accelPppClientIpv6PoolPath('sstp', 'POOL6-A')).toEqual(['vpn', 'sstp', 'client-ipv6-pool', 'POOL6-A'])
    expect(accelPppClientIpv6PoolPrefixPath('sstp', 'POOL6-A', '2001:db8::/64')).toEqual([
      'vpn', 'sstp', 'client-ipv6-pool', 'POOL6-A', 'prefix', '2001:db8::/64',
    ])
  })

  it('builds ppp-options, limits, extended-scripts paths', () => {
    expect(accelPppPppOptionsPath('l2tp')).toEqual(['vpn', 'l2tp', 'remote-access', 'ppp-options'])
    expect(accelPppLimitsPath('sstp')).toEqual(['vpn', 'sstp', 'limits'])
    expect(accelPppExtendedScriptsPath('pptp')).toEqual(['vpn', 'pptp', 'remote-access', 'extended-scripts'])
  })

  it('builds L2TP-only and SSTP-only paths', () => {
    expect(l2tpIpsecSettingsPath()).toEqual(['vpn', 'l2tp', 'remote-access', 'ipsec-settings'])
    expect(l2tpIpsecAuthPath()).toEqual(['vpn', 'l2tp', 'remote-access', 'ipsec-settings', 'authentication'])
    expect(l2tpLnsPath()).toEqual(['vpn', 'l2tp', 'remote-access', 'lns'])
    expect(sstpSslPath()).toEqual(['vpn', 'sstp', 'ssl'])
  })
})
