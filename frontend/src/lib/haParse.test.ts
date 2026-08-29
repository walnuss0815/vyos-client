import { describe, expect, it } from 'vitest'
import {
  conntrackSyncInterfacePath,
  parseConntrackSyncConfig,
  parseHAConfig,
  vrrpGroupPath,
  vrrpSyncGroupPath,
} from './haParse'

describe('parseHAConfig', () => {
  it('parses global settings, a group, and a sync-group', () => {
    const highAvailability = {
      disable: {},
      vrrp: {
        snmp: { trap: {} },
        'global-parameters': {
          'startup-delay': '30',
          version: '3',
          garp: { interval: '0.5', 'master-delay': '10' },
        },
        group: {
          OUTSIDE: {
            interface: 'eth0',
            vrid: '10',
            priority: '200',
            'rfc3768-compatibility': {},
            'hello-source-address': '192.0.2.1',
            'peer-address': ['192.0.2.2'],
            authentication: { password: 'secret', type: 'plaintext-password' },
            'health-check': { ping: '9.9.9.9', 'failure-count': '5' },
            track: { 'exclude-vrrp-interface': {}, interface: ['eth1', 'eth2'] },
            'transition-script': { master: '/config/scripts/master.sh' },
            address: { '192.0.2.254/24': {} },
            'excluded-address': { 'fe80::1/64': {} },
          },
        },
        'sync-group': {
          INTERNAL: {
            member: ['OUTSIDE', 'INSIDE'],
            'health-check': { script: '/config/scripts/check.sh' },
          },
        },
      },
    }

    const parsed = parseHAConfig(highAvailability)
    expect(parsed.disabled).toBe(true)
    expect(parsed.global.snmpTrap).toBe(true)
    expect(parsed.global.startupDelay).toBe(30)
    expect(parsed.global.version).toBe('3')
    expect(parsed.global.garp.interval).toBe('0.5')
    expect(parsed.global.garp.masterDelay).toBe(10)

    expect(parsed.groups).toHaveLength(1)
    const group = parsed.groups[0]
    expect(group.name).toBe('OUTSIDE')
    expect(group.interface).toBe('eth0')
    expect(group.vrid).toBe('10')
    expect(group.priority).toBe(200)
    expect(group.rfc3768Compatibility).toBe(true)
    expect(group.peerAddresses).toEqual(['192.0.2.2'])
    expect(group.authenticationPassword).toBe('secret')
    expect(group.authenticationType).toBe('plaintext-password')
    expect(group.healthCheck).toEqual({ failureCount: 5, interval: 60, ping: '9.9.9.9', script: undefined, timeout: undefined })
    expect(group.excludeVrrpInterface).toBe(true)
    expect(group.trackInterfaces).toEqual(['eth1', 'eth2'])
    expect(group.transitionScripts.master).toBe('/config/scripts/master.sh')
    expect(group.addresses).toEqual([{ address: '192.0.2.254/24', interface: undefined }])
    expect(group.excludedAddresses).toEqual([{ address: 'fe80::1/64', interface: undefined }])

    expect(parsed.syncGroups).toHaveLength(1)
    expect(parsed.syncGroups[0].members).toEqual(['OUTSIDE', 'INSIDE'])
    expect(parsed.syncGroups[0].healthCheck?.script).toBe('/config/scripts/check.sh')
  })

  it('applies documented defaults when fields were never set', () => {
    const parsed = parseHAConfig({ vrrp: { group: { g1: {} } } })
    expect(parsed.groups[0].priority).toBe(100)
    expect(parsed.groups[0].advertiseInterval).toBe(1)
    expect(parsed.groups[0].preemptDelay).toBe(0)
    expect(parsed.global.garp).toEqual({ interval: '0', masterDelay: 5, masterRefresh: 5, masterRefreshRepeat: 1, masterRepeat: 5 })
  })

  // Regression test: numberOrUndefined used to check `!Number.isNaN(n)`
  // alone, which lets Number("Infinity")/Number("-Infinity") through
  // as "valid" - both parse to real (non-NaN) JS numbers despite
  // never being a sane value for a field like priority.
  it('treats an "Infinity" string value as absent, not a real number', () => {
    const parsed = parseHAConfig({ vrrp: { group: { g1: { priority: 'Infinity' } } } })
    expect(parsed.groups[0].priority).toBe(100) // falls back to the documented default
  })

  it('returns empty lists for an undefined tree', () => {
    const parsed = parseHAConfig(undefined)
    expect(parsed.groups).toEqual([])
    expect(parsed.syncGroups).toEqual([])
    expect(parsed.disabled).toBe(false)
  })
})

describe('parseConntrackSyncConfig', () => {
  it('parses every field including the nested interface list', () => {
    const conntrackSync = {
      'accept-protocol': ['tcp', 'udp'],
      'disable-external-cache': {},
      'expect-sync': ['ftp'],
      'failover-mechanism': { vrrp: { 'sync-group': 'INTERNAL' } },
      'ignore-address': ['198.51.100.1'],
      interface: { eth1: { peer: '192.0.2.2', port: '3780' } },
      'listen-address': ['192.0.2.1'],
      'mcast-group': '225.0.0.51',
      'purge-timeout': '120',
    }

    const parsed = parseConntrackSyncConfig(conntrackSync)
    expect(parsed.acceptProtocols).toEqual(['tcp', 'udp'])
    expect(parsed.disableExternalCache).toBe(true)
    expect(parsed.expectSync).toEqual(['ftp'])
    expect(parsed.vrrpSyncGroup).toBe('INTERNAL')
    expect(parsed.ignoreAddresses).toEqual(['198.51.100.1'])
    expect(parsed.interfaces).toEqual([{ name: 'eth1', peer: '192.0.2.2', port: 3780 }])
    expect(parsed.listenAddresses).toEqual(['192.0.2.1'])
    expect(parsed.mcastGroup).toBe('225.0.0.51')
    expect(parsed.purgeTimeout).toBe(120)
  })

  it('applies documented defaults when fields were never set', () => {
    const parsed = parseConntrackSyncConfig({})
    expect(parsed.eventListenQueueSize).toBe(8)
    expect(parsed.mcastGroup).toBe('225.0.0.50')
    expect(parsed.syncQueueSize).toBe(1)
    expect(parsed.purgeTimeout).toBe(60)
    expect(parsed.interfaces).toEqual([])
  })
})

describe('path helpers', () => {
  it('build the expected absolute paths', () => {
    expect(vrrpGroupPath('OUTSIDE', 'priority')).toEqual(['high-availability', 'vrrp', 'group', 'OUTSIDE', 'priority'])
    expect(vrrpSyncGroupPath('INTERNAL', 'member')).toEqual(['high-availability', 'vrrp', 'sync-group', 'INTERNAL', 'member'])
    expect(conntrackSyncInterfacePath('eth1', 'peer')).toEqual(['service', 'conntrack-sync', 'interface', 'eth1', 'peer'])
  })
})
