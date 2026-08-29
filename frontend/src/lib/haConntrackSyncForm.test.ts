import { describe, expect, it } from 'vitest'
import {
  addConntrackSyncInterfaceOps,
  conntrackSyncFormToOps,
  conntrackSyncToFormValues,
  removeConntrackSyncInterfaceOp,
} from './haConntrackSyncForm'
import type { ConntrackSyncConfig } from './haTypes'

const BLANK_CONFIG: ConntrackSyncConfig = {
  acceptProtocols: [],
  disableExternalCache: false,
  disableSyslog: false,
  eventListenQueueSize: 8,
  expectSync: [],
  startupResync: false,
  ignoreAddresses: [],
  interfaces: [],
  listenAddresses: [],
  mcastGroup: '225.0.0.50',
  syncQueueSize: 1,
  purgeTimeout: 60,
}

describe('conntrack-sync settings form', () => {
  it('only emits ops for fields that changed', () => {
    const before = conntrackSyncToFormValues(BLANK_CONFIG)
    const values = { ...before, vrrpSyncGroup: 'INTERNAL', purgeTimeout: '120' }
    const ops = conntrackSyncFormToOps(before, values)
    expect(ops).toEqual([
      {
        op: 'set',
        path: ['service', 'conntrack-sync', 'failover-mechanism', 'vrrp', 'sync-group'],
        value: 'INTERNAL',
      },
      { op: 'set', path: ['service', 'conntrack-sync', 'purge-timeout'], value: '120' },
    ])
  })

  it('toggles a flag field to set/delete', () => {
    const before = conntrackSyncToFormValues(BLANK_CONFIG)
    const values = { ...before, disableExternalCache: true }
    const ops = conntrackSyncFormToOps(before, values)
    expect(ops).toEqual([{ op: 'set', path: ['service', 'conntrack-sync', 'disable-external-cache'] }])
  })

  it('deletes a scalar when cleared back to empty', () => {
    const configured = { ...BLANK_CONFIG, vrrpSyncGroup: 'INTERNAL' }
    const before = conntrackSyncToFormValues(configured)
    const values = { ...before, vrrpSyncGroup: '' }
    const ops = conntrackSyncFormToOps(before, values)
    expect(ops).toEqual([
      { op: 'delete', path: ['service', 'conntrack-sync', 'failover-mechanism', 'vrrp', 'sync-group'] },
    ])
  })

  it('emits nothing when nothing changed', () => {
    const before = conntrackSyncToFormValues(BLANK_CONFIG)
    expect(conntrackSyncFormToOps(before, before)).toEqual([])
  })
})

describe('conntrack-sync interfaces (nested list)', () => {
  it('addConntrackSyncInterfaceOps only sets provided optional fields', () => {
    expect(addConntrackSyncInterfaceOps('eth1', '192.0.2.2', '3780')).toEqual([
      { op: 'set', path: ['service', 'conntrack-sync', 'interface', 'eth1'] },
      { op: 'set', path: ['service', 'conntrack-sync', 'interface', 'eth1', 'peer'], value: '192.0.2.2' },
      { op: 'set', path: ['service', 'conntrack-sync', 'interface', 'eth1', 'port'], value: '3780' },
    ])
    expect(addConntrackSyncInterfaceOps('eth2', '', '')).toEqual([
      { op: 'set', path: ['service', 'conntrack-sync', 'interface', 'eth2'] },
    ])
  })

  it('removeConntrackSyncInterfaceOp deletes the interface tagNode', () => {
    expect(removeConntrackSyncInterfaceOp('eth1')).toEqual({
      op: 'delete',
      path: ['service', 'conntrack-sync', 'interface', 'eth1'],
    })
  })
})
