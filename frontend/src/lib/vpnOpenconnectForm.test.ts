import { describe, expect, it } from 'vitest'
import {
  addOpenconnectAccountingRadiusServerOps,
  addOpenconnectAuthRadiusServerOps,
  addOpenconnectLocalUserOps,
  blankOpenconnectSettingsFormValues,
  disableOpenconnectOp,
  enableOpenconnectOp,
  openconnectConfigToSettingsFormValues,
  openconnectSettingsFormToOps,
  removeOpenconnectAccountingRadiusServerOp,
  removeOpenconnectAuthRadiusServerOp,
  removeOpenconnectLocalUserOp,
  toggleOpenconnectAccountingRadiusModeOp,
  toggleOpenconnectLocalUserDisabledOp,
} from './vpnOpenconnectForm'
import { blankOpenconnectConfig } from './vpnOpenconnectTypes'

describe('enable/disable', () => {
  it('enable sets the root; disable deletes it', () => {
    expect(enableOpenconnectOp()).toEqual({ op: 'set', path: ['vpn', 'openconnect'] })
    expect(disableOpenconnectOp()).toEqual({ op: 'delete', path: ['vpn', 'openconnect'] })
  })
})

describe('accounting radius', () => {
  it('toggles mode', () => {
    expect(toggleOpenconnectAccountingRadiusModeOp(true)).toEqual({
      op: 'set',
      path: ['vpn', 'openconnect', 'accounting', 'mode', 'radius'],
    })
    expect(toggleOpenconnectAccountingRadiusModeOp(false)).toEqual({
      op: 'delete',
      path: ['vpn', 'openconnect', 'accounting', 'mode', 'radius'],
    })
  })

  it('adds a server with acct-port, without leaking the key elsewhere', () => {
    const ops = addOpenconnectAccountingRadiusServerOps('192.0.2.1', 'super-secret-key', '1813')
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'openconnect', 'accounting', 'radius', 'server', '192.0.2.1'] },
      { op: 'set', path: ['vpn', 'openconnect', 'accounting', 'radius', 'server', '192.0.2.1', 'key'], value: 'super-secret-key' },
      { op: 'set', path: ['vpn', 'openconnect', 'accounting', 'radius', 'server', '192.0.2.1', 'acct-port'], value: '1813' },
    ])
  })

  it('removes', () => {
    expect(removeOpenconnectAccountingRadiusServerOp('192.0.2.1')).toEqual({
      op: 'delete',
      path: ['vpn', 'openconnect', 'accounting', 'radius', 'server', '192.0.2.1'],
    })
  })
})

describe('local users', () => {
  it('adds a user with all fields including OTP, without leaking secrets elsewhere', () => {
    const ops = addOpenconnectLocalUserOps('alice', {
      password: 'super-secret',
      otpKey: 'deadbeefdeadbeefdeadbeef',
      otpLength: '8',
      otpInterval: '60',
      otpTokenType: 'hotp-event',
    })
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'alice'] },
      { op: 'set', path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'alice', 'password'], value: 'super-secret' },
      { op: 'set', path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'alice', 'otp', 'key'], value: 'deadbeefdeadbeefdeadbeef' },
      { op: 'set', path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'alice', 'otp', 'otp-length'], value: '8' },
      { op: 'set', path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'alice', 'otp', 'interval'], value: '60' },
      { op: 'set', path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'alice', 'otp', 'token-type'], value: 'hotp-event' },
    ])
  })

  it('adds a user with no optional fields', () => {
    const ops = addOpenconnectLocalUserOps('bob', { password: '', otpKey: '', otpLength: '', otpInterval: '', otpTokenType: '' })
    expect(ops).toEqual([{ op: 'set', path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'bob'] }])
  })

  it('removes and toggles', () => {
    expect(removeOpenconnectLocalUserOp('bob')).toEqual({
      op: 'delete',
      path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'bob'],
    })
    expect(toggleOpenconnectLocalUserDisabledOp('bob', true)).toEqual({
      op: 'set',
      path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'bob', 'disable'],
    })
    expect(toggleOpenconnectLocalUserDisabledOp('bob', false)).toEqual({
      op: 'delete',
      path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'bob', 'disable'],
    })
  })
})

describe('authentication radius servers', () => {
  it('adds with key and port', () => {
    const ops = addOpenconnectAuthRadiusServerOps('192.0.2.9', 'super-secret-key', '1812')
    expect(ops).toEqual([
      { op: 'set', path: ['vpn', 'openconnect', 'authentication', 'radius', 'server', '192.0.2.9'] },
      { op: 'set', path: ['vpn', 'openconnect', 'authentication', 'radius', 'server', '192.0.2.9', 'key'], value: 'super-secret-key' },
      { op: 'set', path: ['vpn', 'openconnect', 'authentication', 'radius', 'server', '192.0.2.9', 'port'], value: '1812' },
    ])
  })

  it('removes', () => {
    expect(removeOpenconnectAuthRadiusServerOp('192.0.2.9')).toEqual({
      op: 'delete',
      path: ['vpn', 'openconnect', 'authentication', 'radius', 'server', '192.0.2.9'],
    })
  })
})

describe('settings form', () => {
  it('round-trips a blank config to blank form values', () => {
    expect(openconnectConfigToSettingsFormValues(blankOpenconnectConfig())).toEqual(blankOpenconnectSettingsFormValues())
  })

  it('diffs scalar and flag fields', () => {
    const before = blankOpenconnectConfig()
    const values = blankOpenconnectSettingsFormValues()
    values.localAuthMode = 'password-otp'
    values.radiusAuthEnabled = true
    values.listenPortTcp = '8443'
    values.httpSecurityHeaders = true
    values.tlsVersionMin = '1.3'
    values.clientIpv6PoolPrefix = '2001:db8::/64'

    const ops = openconnectSettingsFormToOps(before, values)
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'openconnect', 'authentication', 'mode', 'local'], value: 'password-otp' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'openconnect', 'authentication', 'mode', 'radius'] })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'openconnect', 'listen-ports', 'tcp'], value: '8443' })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'openconnect', 'http-security-headers'] })
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'openconnect', 'tls-version-min'], value: '1.3' })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['vpn', 'openconnect', 'network-settings', 'client-ipv6-pool', 'prefix'],
      value: '2001:db8::/64',
    })
  })

  it('sets the SSL passphrase only when provided, without leaking it in an unrelated op', () => {
    const before = blankOpenconnectConfig()
    const values = blankOpenconnectSettingsFormValues()
    values.hasPassphrase = 'super-secret-pass'
    const ops = openconnectSettingsFormToOps(before, values)
    expect(ops).toContainEqual({ op: 'set', path: ['vpn', 'openconnect', 'ssl', 'passphrase'], value: 'super-secret-pass' })
    expect(ops.filter((o) => o.value === 'super-secret-pass')).toHaveLength(1)
  })

  it('deletes a scalar field when cleared', () => {
    const before = blankOpenconnectConfig()
    before.enabled = true
    before.listenAddress = '203.0.113.1'
    const values = openconnectConfigToSettingsFormValues(before)
    values.listenAddress = ''
    const ops = openconnectSettingsFormToOps(before, values)
    expect(ops).toContainEqual({ op: 'delete', path: ['vpn', 'openconnect', 'listen-address'] })
  })

  it('produces no ops when nothing changed', () => {
    const before = blankOpenconnectConfig()
    before.enabled = true
    const values = openconnectConfigToSettingsFormValues(before)
    expect(openconnectSettingsFormToOps(before, values)).toEqual([])
  })
})
