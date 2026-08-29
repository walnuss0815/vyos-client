import { describe, expect, it } from 'vitest'
import {
  addVRRPGroupAddressOps,
  addVRRPSyncGroupMemberOp,
  blankVRRPGroupFormValues,
  blankVRRPSyncGroupFormValues,
  deleteVRRPGroupOp,
  deleteVRRPSyncGroupOp,
  removeVRRPGroupAddressOp,
  removeVRRPSyncGroupMemberOp,
  toggleHADisableOp,
  toggleVrrpSnmpTrapOp,
  vrrpGlobalFormToOps,
  vrrpGroupFormToOps,
  vrrpGroupToFormValues,
  vrrpSyncGroupFormToOps,
  vrrpSyncGroupToFormValues,
} from './haVrrpForm'
import type { VRRPGroup, VRRPSyncGroup } from './haTypes'

describe('HA global toggles', () => {
  it('sets or deletes disable based on the new value', () => {
    expect(toggleHADisableOp(true)).toEqual({ op: 'set', path: ['high-availability', 'disable'] })
    expect(toggleHADisableOp(false)).toEqual({ op: 'delete', path: ['high-availability', 'disable'] })
  })

  it('vrrp snmp trap uses its nested path', () => {
    expect(toggleVrrpSnmpTrapOp(true)).toEqual({
      op: 'set',
      path: ['high-availability', 'vrrp', 'snmp', 'trap'],
    })
  })

  it('vrrpGlobalFormToOps only emits changed fields', () => {
    const before = {
      startupDelay: '', version: '', garpInterval: '0', garpMasterDelay: '5',
      garpMasterRefresh: '5', garpMasterRefreshRepeat: '1', garpMasterRepeat: '5',
    }
    const values = { ...before, startupDelay: '30' }
    expect(vrrpGlobalFormToOps(before, values)).toEqual([
      { op: 'set', path: ['high-availability', 'vrrp', 'global-parameters', 'startup-delay'], value: '30' },
    ])
  })
})

describe('VRRP group form', () => {
  it('creates a new group with scalars, flags, and authentication set together', () => {
    const values = blankVRRPGroupFormValues()
    values.interface = 'eth0'
    values.vrid = '10'
    values.rfc3768Compatibility = true
    values.authenticationPassword = 'secret'
    values.authenticationType = 'plaintext-password'
    const ops = vrrpGroupFormToOps('OUTSIDE', undefined, values)

    expect(ops[0]).toEqual({ op: 'set', path: ['high-availability', 'vrrp', 'group', 'OUTSIDE'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['high-availability', 'vrrp', 'group', 'OUTSIDE', 'interface'],
      value: 'eth0',
    })
    expect(ops).toContainEqual({ op: 'set', path: ['high-availability', 'vrrp', 'group', 'OUTSIDE', 'rfc3768-compatibility'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['high-availability', 'vrrp', 'group', 'OUTSIDE', 'authentication', 'password'],
      value: 'secret',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['high-availability', 'vrrp', 'group', 'OUTSIDE', 'authentication', 'type'],
      value: 'plaintext-password',
    })
  })

  it('deletes the authentication node when both fields are cleared', () => {
    const before: VRRPGroup = {
      name: 'OUTSIDE',
      priority: 100,
      advertiseInterval: 1,
      disabled: false,
      noPreempt: false,
      preemptDelay: 0,
      rfc3768Compatibility: false,
      peerAddresses: [],
      authenticationPassword: 'secret',
      authenticationType: 'plaintext-password',
      excludeVrrpInterface: false,
      trackInterfaces: [],
      transitionScripts: {},
      addresses: [],
      excludedAddresses: [],
    }
    const values = vrrpGroupToFormValues(before)
    values.authenticationPassword = ''
    values.authenticationType = ''
    const ops = vrrpGroupFormToOps('OUTSIDE', before, values)
    expect(ops).toEqual([{ op: 'delete', path: ['high-availability', 'vrrp', 'group', 'OUTSIDE', 'authentication'] }])
  })

  it('emits nothing when editing with no changes', () => {
    const before: VRRPGroup = {
      name: 'OUTSIDE',
      interface: 'eth0',
      vrid: '10',
      priority: 100,
      advertiseInterval: 1,
      disabled: false,
      noPreempt: false,
      preemptDelay: 0,
      rfc3768Compatibility: false,
      peerAddresses: [],
      excludeVrrpInterface: false,
      trackInterfaces: [],
      transitionScripts: {},
      addresses: [],
      excludedAddresses: [],
    }
    const ops = vrrpGroupFormToOps('OUTSIDE', before, vrrpGroupToFormValues(before))
    expect(ops).toEqual([])
  })

  it('deleteVRRPGroupOp deletes the whole group tagNode', () => {
    expect(deleteVRRPGroupOp('OUTSIDE')).toEqual({ op: 'delete', path: ['high-availability', 'vrrp', 'group', 'OUTSIDE'] })
  })
})

describe('VRRP group addresses (nested list)', () => {
  it('addVRRPGroupAddressOps sets interface only when provided', () => {
    expect(addVRRPGroupAddressOps('OUTSIDE', 'address', '192.0.2.254/24', '')).toEqual([
      { op: 'set', path: ['high-availability', 'vrrp', 'group', 'OUTSIDE', 'address', '192.0.2.254/24'] },
    ])
    expect(addVRRPGroupAddressOps('OUTSIDE', 'excluded-address', 'fe80::1/64', 'eth1')).toEqual([
      { op: 'set', path: ['high-availability', 'vrrp', 'group', 'OUTSIDE', 'excluded-address', 'fe80::1/64'] },
      {
        op: 'set',
        path: ['high-availability', 'vrrp', 'group', 'OUTSIDE', 'excluded-address', 'fe80::1/64', 'interface'],
        value: 'eth1',
      },
    ])
  })

  it('removeVRRPGroupAddressOp deletes the address tagNode', () => {
    expect(removeVRRPGroupAddressOp('OUTSIDE', 'address', '192.0.2.254/24')).toEqual({
      op: 'delete',
      path: ['high-availability', 'vrrp', 'group', 'OUTSIDE', 'address', '192.0.2.254/24'],
    })
  })
})

describe('VRRP sync-group form', () => {
  it('creates a new sync-group with health-check fields', () => {
    const values = blankVRRPSyncGroupFormValues()
    values.healthCheckScript = '/config/scripts/check.sh'
    const ops = vrrpSyncGroupFormToOps('INTERNAL', undefined, values)
    expect(ops[0]).toEqual({ op: 'set', path: ['high-availability', 'vrrp', 'sync-group', 'INTERNAL'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['high-availability', 'vrrp', 'sync-group', 'INTERNAL', 'health-check', 'script'],
      value: '/config/scripts/check.sh',
    })
  })

  it('emits nothing when editing with no changes', () => {
    const before: VRRPSyncGroup = { name: 'INTERNAL', members: ['OUTSIDE'], transitionScripts: {} }
    const ops = vrrpSyncGroupFormToOps('INTERNAL', before, vrrpSyncGroupToFormValues(before))
    expect(ops).toEqual([])
  })

  it('deleteVRRPSyncGroupOp deletes the whole sync-group tagNode', () => {
    expect(deleteVRRPSyncGroupOp('INTERNAL')).toEqual({
      op: 'delete',
      path: ['high-availability', 'vrrp', 'sync-group', 'INTERNAL'],
    })
  })
})

describe('VRRP sync-group members (multi-valued leaf)', () => {
  it('add/remove member ops target the member leaf with a value', () => {
    expect(addVRRPSyncGroupMemberOp('INTERNAL', 'OUTSIDE')).toEqual({
      op: 'set',
      path: ['high-availability', 'vrrp', 'sync-group', 'INTERNAL', 'member'],
      value: 'OUTSIDE',
    })
    expect(removeVRRPSyncGroupMemberOp('INTERNAL', 'OUTSIDE')).toEqual({
      op: 'delete',
      path: ['high-availability', 'vrrp', 'sync-group', 'INTERNAL', 'member'],
      value: 'OUTSIDE',
    })
  })
})
