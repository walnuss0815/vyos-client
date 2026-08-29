import { describe, expect, it } from 'vitest'
import {
  accelPppConfigToSettingsFormValues,
  accelPppSettingsFormToOps,
  addAccelPppClientIpPoolOps,
  addAccelPppClientIpv6PoolPrefixOps,
  addAccelPppLocalUserOps,
  addAccelPppRadiusServerOps,
  blankAccelPppSettingsFormValues,
  disableAccelPppOp,
  enableAccelPppOp,
  removeAccelPppClientIpPoolOp,
  removeAccelPppClientIpv6PoolOp,
  removeAccelPppClientIpv6PoolPrefixOp,
  removeAccelPppLocalUserOp,
  removeAccelPppRadiusServerOp,
  toggleAccelPppLocalUserDisabledOp,
} from './vpnAccelPppForm'
import { blankAccelPppConfig } from './vpnAccelPppTypes'

describe('enable/disable', () => {
  it('enable sets the kind root; disable deletes it', () => {
    expect(enableAccelPppOp('l2tp')).toEqual({ op: 'set', path: ['vpn', 'l2tp'] })
    expect(disableAccelPppOp('sstp')).toEqual({ op: 'delete', path: ['vpn', 'sstp'] })
  })
})

describe('local users', () => {
  it('adds a user with all optional fields, leaking no raw password in an unexpected place', () => {
    const ops = addAccelPppLocalUserOps('l2tp', 'alice', {
      password: 'super-secret',
      staticIp: '192.0.2.10',
      rateLimitUpload: '1000',
      rateLimitDownload: '2000',
    })
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'local-users', 'username', 'alice'] },
      { op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'local-users', 'username', 'alice', 'password'], value: 'super-secret' },
      { op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'local-users', 'username', 'alice', 'static-ip'], value: '192.0.2.10' },
      { op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'local-users', 'username', 'alice', 'rate-limit', 'upload'], value: '1000' },
      { op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'local-users', 'username', 'alice', 'rate-limit', 'download'], value: '2000' },
    ])
  })

  it('adds a user with no optional fields set', () => {
    const ops = addAccelPppLocalUserOps('sstp', 'bob', { password: '', staticIp: '', rateLimitUpload: '', rateLimitDownload: '' })
    expect(ops).toEqual([{ op: 'set', path: ['vpn', 'sstp', 'authentication', 'local-users', 'username', 'bob'] }])
  })

  it('removes and toggles', () => {
    expect(removeAccelPppLocalUserOp('pptp', 'bob')).toEqual({
      op: 'delete',
      path: ['vpn', 'pptp', 'remote-access', 'authentication', 'local-users', 'username', 'bob'],
    })
    expect(toggleAccelPppLocalUserDisabledOp('pptp', 'bob', true)).toEqual({
      op: 'set',
      path: ['vpn', 'pptp', 'remote-access', 'authentication', 'local-users', 'username', 'bob', 'disable'],
    })
    expect(toggleAccelPppLocalUserDisabledOp('pptp', 'bob', false)).toEqual({
      op: 'delete',
      path: ['vpn', 'pptp', 'remote-access', 'authentication', 'local-users', 'username', 'bob', 'disable'],
    })
  })
})

describe('radius servers', () => {
  it('adds with key and port, without leaking the key elsewhere', () => {
    const ops = addAccelPppRadiusServerOps('l2tp', '192.0.2.1', 'super-secret-key', '1812')
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'radius', 'server', '192.0.2.1'] },
      { op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'radius', 'server', '192.0.2.1', 'key'], value: 'super-secret-key' },
      { op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'radius', 'server', '192.0.2.1', 'port'], value: '1812' },
    ])
  })

  it('removes', () => {
    expect(removeAccelPppRadiusServerOp('sstp', '192.0.2.1')).toEqual({
      op: 'delete',
      path: ['vpn', 'sstp', 'authentication', 'radius', 'server', '192.0.2.1'],
    })
  })
})

describe('client ip pools', () => {
  it('adds with multiple ranges and a next-pool', () => {
    const ops = addAccelPppClientIpPoolOps('pptp', 'POOL-A', { ranges: ['192.0.2.0/24', '198.51.100.0/24'], nextPool: 'POOL-B' })
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'pptp', 'remote-access', 'client-ip-pool', 'POOL-A'] },
      { op: 'set', path: ['vpn', 'pptp', 'remote-access', 'client-ip-pool', 'POOL-A', 'range'], value: '192.0.2.0/24' },
      { op: 'set', path: ['vpn', 'pptp', 'remote-access', 'client-ip-pool', 'POOL-A', 'range'], value: '198.51.100.0/24' },
      { op: 'set', path: ['vpn', 'pptp', 'remote-access', 'client-ip-pool', 'POOL-A', 'next-pool'], value: 'POOL-B' },
    ])
  })

  it('removes', () => {
    expect(removeAccelPppClientIpPoolOp('l2tp', 'POOL-A')).toEqual({
      op: 'delete',
      path: ['vpn', 'l2tp', 'remote-access', 'client-ip-pool', 'POOL-A'],
    })
  })
})

describe('client ipv6 pools', () => {
  it('adds a prefix with a mask, and without', () => {
    const ops = addAccelPppClientIpv6PoolPrefixOps('sstp', 'POOL6-A', '2001:db8::/64', '80')
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'sstp', 'client-ipv6-pool', 'POOL6-A', 'prefix', '2001:db8::/64'] },
      { op: 'set', path: ['vpn', 'sstp', 'client-ipv6-pool', 'POOL6-A', 'prefix', '2001:db8::/64', 'mask'], value: '80' },
    ])
    const opsNoMask = addAccelPppClientIpv6PoolPrefixOps('sstp', 'POOL6-A', '2001:db8::/64', '')
    expect(opsNoMask).toEqual([{ op: 'set', path: ['vpn', 'sstp', 'client-ipv6-pool', 'POOL6-A', 'prefix', '2001:db8::/64'] }])
  })

  it('removes pool and prefix', () => {
    expect(removeAccelPppClientIpv6PoolOp('l2tp', 'POOL6-A')).toEqual({
      op: 'delete',
      path: ['vpn', 'l2tp', 'remote-access', 'client-ipv6-pool', 'POOL6-A'],
    })
    expect(removeAccelPppClientIpv6PoolPrefixOp('l2tp', 'POOL6-A', '2001:db8::/64')).toEqual({
      op: 'delete',
      path: ['vpn', 'l2tp', 'remote-access', 'client-ipv6-pool', 'POOL6-A', 'prefix', '2001:db8::/64'],
    })
  })
})

describe('settings form', () => {
  it('round-trips a blank config to blank form values', () => {
    expect(accelPppConfigToSettingsFormValues(blankAccelPppConfig())).toEqual(blankAccelPppSettingsFormValues())
  })

  it('diffs common fields for l2tp, including outside-address', () => {
    const before = blankAccelPppConfig()
    const values = blankAccelPppSettingsFormValues()
    values.description = 'my l2tp server'
    values.authMode = 'local'
    values.authProtocols = ['pap', 'chap']
    values.mtu = '1436'
    values.outsideAddress = '203.0.113.1'
    values.disableCcp = true

    const ops = accelPppSettingsFormToOps('l2tp', before, values)
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'description'], value: 'my l2tp server' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'mode'], value: 'local' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'protocols'], value: 'pap' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'protocols'], value: 'chap' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'mtu'], value: '1436' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'outside-address'], value: '203.0.113.1' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'ppp-options', 'disable-ccp'] })
  })

  it('does not emit outside-address ops for sstp', () => {
    const before = blankAccelPppConfig()
    const values = blankAccelPppSettingsFormValues()
    values.outsideAddress = '203.0.113.1'
    const ops = accelPppSettingsFormToOps('sstp', before, values)
    expect(ops.some((o) => o.path.includes('outside-address'))).toBe(false)
  })

  it('emits SSTP-only ssl/port/host-name ops only for sstp', () => {
    const before = blankAccelPppConfig()
    const values = blankAccelPppSettingsFormValues()
    values.caCertificate = 'my-ca'
    values.certificate = 'my-cert'
    values.port = '8443'
    values.sstpHostName = 'vpn.example.com'
    const ops = accelPppSettingsFormToOps('sstp', before, values)
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'sstp', 'ssl', 'ca-certificate'], value: 'my-ca' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'sstp', 'ssl', 'certificate'], value: 'my-cert' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'sstp', 'port'], value: '8443' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'sstp', 'host-name'], value: 'vpn.example.com' })

    const l2tpOps = accelPppSettingsFormToOps('l2tp', before, values)
    expect(l2tpOps.some((o) => o.path.includes('ssl'))).toBe(false)
    expect(l2tpOps.some((o) => o.path.includes('port'))).toBe(false)
  })

  it('emits L2TP-only ipsec-settings/lns ops only for l2tp, without leaking secrets in the op value list length', () => {
    const before = blankAccelPppConfig()
    const values = blankAccelPppSettingsFormValues()
    values.ipsecAuthMode = 'pre-shared-secret'
    values.hasIpsecPresharedSecret = 'super-secret-ipsec'
    values.ikeLifetime = '3600'
    values.espLifetime = '3600'
    values.hasLnsSharedSecret = 'super-secret-lns'
    values.lnsHostName = 'lns.example.com'

    const ops = accelPppSettingsFormToOps('l2tp', before, values)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'ipsec-settings', 'authentication', 'mode'],
      value: 'pre-shared-secret',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'ipsec-settings', 'authentication', 'pre-shared-secret'],
      value: 'super-secret-ipsec',
    })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'ipsec-settings', 'ike-lifetime'], value: '3600' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'ipsec-settings', 'lifetime'], value: '3600' })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'lns', 'shared-secret'],
      value: 'super-secret-lns',
    })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'l2tp', 'remote-access', 'lns', 'host-name'], value: 'lns.example.com' })

    const pptpOps = accelPppSettingsFormToOps('pptp', before, values)
    expect(pptpOps.some((o) => o.path.includes('ipsec-settings'))).toBe(false)
    expect(pptpOps.some((o) => o.path.includes('lns'))).toBe(false)
  })

  it('deletes a scalar field when cleared', () => {
    const before = blankAccelPppConfig()
    before.enabled = true
    before.description = 'old description'
    const values = accelPppConfigToSettingsFormValues(before)
    values.description = ''
    const ops = accelPppSettingsFormToOps('sstp', before, values)
    expect(ops).toContainEqual({ op: 'delete', path: ['vpn', 'sstp', 'description'] })
  })

  it('clears the authProtocols multi-value field by deleting the whole leaf', () => {
    const before = blankAccelPppConfig()
    before.enabled = true
    before.authentication.protocols = ['pap']
    const values = accelPppConfigToSettingsFormValues(before)
    values.authProtocols = []
    const ops = accelPppSettingsFormToOps('sstp', before, values)
    expect(ops).toContainEqual({ op: 'delete', path: ['vpn', 'sstp', 'authentication', 'protocols'] })
  })

  it('produces no ops when nothing changed', () => {
    const before = blankAccelPppConfig()
    before.enabled = true
    const values = accelPppConfigToSettingsFormValues(before)
    expect(accelPppSettingsFormToOps('l2tp', before, values)).toEqual([])
  })
})
