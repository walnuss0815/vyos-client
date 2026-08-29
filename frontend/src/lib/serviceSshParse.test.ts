import { describe, expect, it } from 'vitest'
import {
  parseSSHConfig,
  sshAllowPath,
  sshDenyPath,
  sshDynamicProtectionPath,
  sshPath,
  sshRekeyPath,
} from './serviceSshParse'

describe('parseSSHConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    const config = parseSSHConfig(undefined)
    expect(config.enabled).toBe(false)
    expect(config.allowGroups).toEqual([])
  })

  it('marks the service enabled when the node is present, even if empty', () => {
    expect(parseSSHConfig({}).enabled).toBe(true)
  })

  it('parses access-control allow/deny group/user lists', () => {
    const ssh = {
      'access-control': {
        allow: { group: ['admins'], user: ['alice'] },
        deny: { group: ['guests'], user: ['bob'] },
      },
    }
    const config = parseSSHConfig(ssh)
    expect(config.allowGroups).toEqual(['admins'])
    expect(config.allowUsers).toEqual(['alice'])
    expect(config.denyGroups).toEqual(['guests'])
    expect(config.denyUsers).toEqual(['bob'])
  })

  it('parses algorithm lists', () => {
    const ssh = {
      cipher: ['aes256-gcm@openssh.com'],
      'hostkey-algorithm': ['ssh-ed25519'],
      'pubkey-accepted-algorithm': ['ssh-ed25519'],
      'key-exchange': ['curve25519-sha256'],
      mac: ['hmac-sha2-256'],
    }
    const config = parseSSHConfig(ssh)
    expect(config.ciphers).toEqual(['aes256-gcm@openssh.com'])
    expect(config.hostkeyAlgorithms).toEqual(['ssh-ed25519'])
    expect(config.pubkeyAcceptedAlgorithms).toEqual(['ssh-ed25519'])
    expect(config.keyExchangeAlgorithms).toEqual(['curve25519-sha256'])
    expect(config.macAlgorithms).toEqual(['hmac-sha2-256'])
  })

  it('parses flags', () => {
    const ssh = {
      'disable-host-validation': {},
      'disable-password-authentication': {},
      fido: { 'pin-required': {}, 'touch-required': {} },
    }
    const config = parseSSHConfig(ssh)
    expect(config.disableHostValidation).toBe(true)
    expect(config.disablePasswordAuthentication).toBe(true)
    expect(config.fidoPinRequired).toBe(true)
    expect(config.fidoTouchRequired).toBe(true)
  })

  it('parses dynamic-protection settings', () => {
    const ssh = {
      'dynamic-protection': {
        'block-time': '60',
        'detect-time': '900',
        threshold: '10',
        'allow-from': ['192.0.2.0/24'],
      },
    }
    const config = parseSSHConfig(ssh)
    expect(config.dynamicProtectionBlockTime).toBe('60')
    expect(config.dynamicProtectionDetectTime).toBe('900')
    expect(config.dynamicProtectionThreshold).toBe('10')
    expect(config.dynamicProtectionAllowFrom).toEqual(['192.0.2.0/24'])
  })

  it('parses listen-address, loglevel, port, rekey, client-keepalive-interval, trusted-user-ca, and vrf', () => {
    const ssh = {
      'listen-address': ['192.0.2.1'],
      loglevel: 'verbose',
      port: ['22', '2222'],
      rekey: { data: '1024', time: '60' },
      'client-keepalive-interval': '30',
      'trusted-user-ca': 'my-ca',
      vrf: ['RED', 'BLUE'],
    }
    const config = parseSSHConfig(ssh)
    expect(config.listenAddresses).toEqual(['192.0.2.1'])
    expect(config.loglevel).toBe('verbose')
    expect(config.ports).toEqual(['22', '2222'])
    expect(config.rekeyData).toBe('1024')
    expect(config.rekeyTime).toBe('60')
    expect(config.clientKeepaliveInterval).toBe('30')
    expect(config.trustedUserCA).toBe('my-ca')
    expect(config.vrfs).toEqual(['RED', 'BLUE'])
  })
})

describe('path builders', () => {
  it('builds an ssh base path', () => {
    expect(sshPath('loglevel')).toEqual(['service', 'ssh', 'loglevel'])
  })

  it('builds allow/deny paths', () => {
    expect(sshAllowPath('group')).toEqual(['service', 'ssh', 'access-control', 'allow', 'group'])
    expect(sshDenyPath('user')).toEqual(['service', 'ssh', 'access-control', 'deny', 'user'])
  })

  it('builds a dynamic-protection path', () => {
    expect(sshDynamicProtectionPath('threshold')).toEqual([
      'service',
      'ssh',
      'dynamic-protection',
      'threshold',
    ])
  })

  it('builds a rekey path', () => {
    expect(sshRekeyPath('data')).toEqual(['service', 'ssh', 'rekey', 'data'])
  })
})
