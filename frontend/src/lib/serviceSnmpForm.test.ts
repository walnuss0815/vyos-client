import { describe, expect, it } from 'vitest'
import {
  addSNMPCommunityOps,
  addSNMPListenAddressOps,
  addSNMPTrapTargetOps,
  addSNMPv3GroupOps,
  addSNMPv3TrapTargetOps,
  addSNMPv3UserOps,
  addSNMPv3ViewOidOps,
  addSNMPv3ViewOp,
  blankSNMPSettingsFormValues,
  disableSNMPOp,
  enableSNMPOp,
  removeSNMPCommunityOp,
  removeSNMPListenAddressOp,
  removeSNMPTrapTargetOp,
  removeSNMPv3GroupOp,
  removeSNMPv3TrapTargetOp,
  removeSNMPv3UserOp,
  removeSNMPv3ViewOidOp,
  removeSNMPv3ViewOp,
  snmpConfigToFormValues,
  snmpSettingsFormToOps,
  snmpV3EngineIdFormToOps,
} from './serviceSnmpForm'
import { blankSNMPConfig } from './serviceSnmpTypes'

describe('snmpSettingsFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(snmpSettingsFormToOps(blankSNMPConfig(), blankSNMPSettingsFormValues())).toEqual([])
  })

  it('queues scalar fields', () => {
    const values = blankSNMPSettingsFormValues()
    values.contact = 'admin@example.com'
    values.protocol = 'tcp'

    expect(snmpSettingsFormToOps(blankSNMPConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'snmp', 'contact'], value: 'admin@example.com' },
      { op: 'set', path: ['service', 'snmp', 'protocol'], value: 'tcp' },
    ])
  })

  it('queues a delete when cleared', () => {
    const before = { ...blankSNMPConfig(), contact: 'admin@example.com' }
    const values = snmpConfigToFormValues(before)
    values.contact = ''

    expect(snmpSettingsFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'snmp', 'contact'] },
    ])
  })
})

describe('enableSNMPOp / disableSNMPOp', () => {
  it('builds the expected ops', () => {
    expect(enableSNMPOp()).toEqual({ op: 'set', path: ['service', 'snmp'] })
    expect(disableSNMPOp()).toEqual({ op: 'delete', path: ['service', 'snmp'] })
  })
})

describe('community ops', () => {
  it('always sets the tag, plus authorization when given', () => {
    expect(addSNMPCommunityOps('public', 'ro')).toEqual([
      { op: 'set', path: ['service', 'snmp', 'community', 'public'] },
      { op: 'set', path: ['service', 'snmp', 'community', 'public', 'authorization'], value: 'ro' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeSNMPCommunityOp('public')).toEqual({
      op: 'delete',
      path: ['service', 'snmp', 'community', 'public'],
    })
  })
})

describe('listen-address ops', () => {
  it('always sets the tag, plus port when given', () => {
    expect(addSNMPListenAddressOps('192.0.2.1', '1161')).toEqual([
      { op: 'set', path: ['service', 'snmp', 'listen-address', '192.0.2.1'] },
      { op: 'set', path: ['service', 'snmp', 'listen-address', '192.0.2.1', 'port'], value: '1161' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeSNMPListenAddressOp('192.0.2.1')).toEqual({
      op: 'delete',
      path: ['service', 'snmp', 'listen-address', '192.0.2.1'],
    })
  })
})

describe('trap-target ops', () => {
  it('always sets the tag, plus community/port when given', () => {
    expect(addSNMPTrapTargetOps('192.0.2.2', 'public', '1162')).toEqual([
      { op: 'set', path: ['service', 'snmp', 'trap-target', '192.0.2.2'] },
      { op: 'set', path: ['service', 'snmp', 'trap-target', '192.0.2.2', 'community'], value: 'public' },
      { op: 'set', path: ['service', 'snmp', 'trap-target', '192.0.2.2', 'port'], value: '1162' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeSNMPTrapTargetOp('192.0.2.2')).toEqual({
      op: 'delete',
      path: ['service', 'snmp', 'trap-target', '192.0.2.2'],
    })
  })
})

describe('snmpV3EngineIdFormToOps', () => {
  it('queues nothing when unchanged', () => {
    expect(snmpV3EngineIdFormToOps(undefined, '')).toEqual([])
  })

  it('queues a set when given', () => {
    expect(snmpV3EngineIdFormToOps(undefined, '0102030405060708090a0b0c0d0e0f10')).toEqual([
      { op: 'set', path: ['service', 'snmp', 'v3', 'engineid'], value: '0102030405060708090a0b0c0d0e0f10' },
    ])
  })

  it('queues a delete when cleared', () => {
    expect(snmpV3EngineIdFormToOps('0102030405060708090a0b0c0d0e0f10', '')).toEqual([
      { op: 'delete', path: ['service', 'snmp', 'v3', 'engineid'] },
    ])
  })

  // Regression test: this used to check the raw (untrimmed) value, so
  // whitespace-only input queued a `set` with a literal whitespace
  // value instead of being treated the same as actually clearing the
  // field.
  it('treats whitespace-only input the same as clearing it', () => {
    expect(snmpV3EngineIdFormToOps('0102030405060708090a0b0c0d0e0f10', '   ')).toEqual([
      { op: 'delete', path: ['service', 'snmp', 'v3', 'engineid'] },
    ])
  })
})

describe('v3 group ops', () => {
  it('always sets the tag, plus mode/seclevel/view when given', () => {
    expect(addSNMPv3GroupOps('admins', 'rw', 'priv', 'all')).toEqual([
      { op: 'set', path: ['service', 'snmp', 'v3', 'group', 'admins'] },
      { op: 'set', path: ['service', 'snmp', 'v3', 'group', 'admins', 'mode'], value: 'rw' },
      { op: 'set', path: ['service', 'snmp', 'v3', 'group', 'admins', 'seclevel'], value: 'priv' },
      { op: 'set', path: ['service', 'snmp', 'v3', 'group', 'admins', 'view'], value: 'all' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeSNMPv3GroupOp('admins')).toEqual({
      op: 'delete',
      path: ['service', 'snmp', 'v3', 'group', 'admins'],
    })
  })
})

describe('v3 user ops', () => {
  it('always sets the tag, plus given fields, writing only plaintext passwords', () => {
    const ops = addSNMPv3UserOps('alice', {
      authPassword: 'super-secret1',
      authType: 'sha',
      group: 'admins',
      mode: 'rw',
      privacyPassword: 'super-secret2',
      privacyType: 'aes',
    })
    expect(ops).toEqual([
      { op: 'set', path: ['service', 'snmp', 'v3', 'user', 'alice'] },
      { op: 'set', path: ['service', 'snmp', 'v3', 'user', 'alice', 'group'], value: 'admins' },
      { op: 'set', path: ['service', 'snmp', 'v3', 'user', 'alice', 'mode'], value: 'rw' },
      {
        op: 'set',
        path: ['service', 'snmp', 'v3', 'user', 'alice', 'auth', 'plaintext-password'],
        value: 'super-secret1',
      },
      { op: 'set', path: ['service', 'snmp', 'v3', 'user', 'alice', 'auth', 'type'], value: 'sha' },
      {
        op: 'set',
        path: ['service', 'snmp', 'v3', 'user', 'alice', 'privacy', 'plaintext-password'],
        value: 'super-secret2',
      },
      { op: 'set', path: ['service', 'snmp', 'v3', 'user', 'alice', 'privacy', 'type'], value: 'aes' },
    ])
  })

  it('omits blank passwords', () => {
    const ops = addSNMPv3UserOps('alice', {
      authPassword: '',
      authType: '',
      group: '',
      mode: '',
      privacyPassword: '',
      privacyType: '',
    })
    expect(ops).toEqual([{ op: 'set', path: ['service', 'snmp', 'v3', 'user', 'alice'] }])
  })

  it('builds a remove op', () => {
    expect(removeSNMPv3UserOp('alice')).toEqual({
      op: 'delete',
      path: ['service', 'snmp', 'v3', 'user', 'alice'],
    })
  })
})

describe('v3 view ops', () => {
  it('builds add/remove ops for the view itself', () => {
    expect(addSNMPv3ViewOp('all')).toEqual({ op: 'set', path: ['service', 'snmp', 'v3', 'view', 'all'] })
    expect(removeSNMPv3ViewOp('all')).toEqual({ op: 'delete', path: ['service', 'snmp', 'v3', 'view', 'all'] })
  })

  it('always sets the OID tag, plus mask when given', () => {
    expect(addSNMPv3ViewOidOps('all', '1.3.6.1', 'ff.ff')).toEqual([
      { op: 'set', path: ['service', 'snmp', 'v3', 'view', 'all', 'oid', '1.3.6.1'] },
      { op: 'set', path: ['service', 'snmp', 'v3', 'view', 'all', 'oid', '1.3.6.1', 'mask'], value: 'ff.ff' },
    ])
  })

  it('builds an OID remove op', () => {
    expect(removeSNMPv3ViewOidOp('all', '1.3.6.1')).toEqual({
      op: 'delete',
      path: ['service', 'snmp', 'v3', 'view', 'all', 'oid', '1.3.6.1'],
    })
  })
})

describe('v3 trap-target ops', () => {
  it('always sets the tag, plus given fields, writing only plaintext passwords', () => {
    const ops = addSNMPv3TrapTargetOps('192.0.2.3', {
      authPassword: 'secret',
      authType: 'sha',
      privacyPassword: 'secret2',
      privacyType: 'aes',
      port: '1162',
      protocol: 'tcp',
      type: 'trap',
      user: 'alice',
    })
    expect(ops).toEqual([
      { op: 'set', path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3'] },
      {
        op: 'set',
        path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3', 'auth', 'plaintext-password'],
        value: 'secret',
      },
      { op: 'set', path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3', 'auth', 'type'], value: 'sha' },
      {
        op: 'set',
        path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3', 'privacy', 'plaintext-password'],
        value: 'secret2',
      },
      {
        op: 'set',
        path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3', 'privacy', 'type'],
        value: 'aes',
      },
      { op: 'set', path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3', 'port'], value: '1162' },
      { op: 'set', path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3', 'protocol'], value: 'tcp' },
      { op: 'set', path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3', 'type'], value: 'trap' },
      { op: 'set', path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3', 'user'], value: 'alice' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeSNMPv3TrapTargetOp('192.0.2.3')).toEqual({
      op: 'delete',
      path: ['service', 'snmp', 'v3', 'trap-target', '192.0.2.3'],
    })
  })
})
