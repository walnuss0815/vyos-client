import { describe, expect, it } from 'vitest'
import {
  addLocalFacilityOps,
  addRemoteFacilityOps,
  addRemoteHostOps,
  deleteRemoteHostOp,
  removeLocalFacilityOp,
  removeRemoteFacilityOp,
  setRemotePortOp,
  setRemoteProtocolOp,
} from './systemSyslogForm'

describe('local facility ops', () => {
  it('builds a bare set op with no level', () => {
    expect(addLocalFacilityOps('all', '')).toEqual([
      { op: 'set', path: ['system', 'syslog', 'local', 'facility', 'all'] },
    ])
  })

  it('includes the level when given', () => {
    expect(addLocalFacilityOps('kern', 'debug')).toEqual([
      { op: 'set', path: ['system', 'syslog', 'local', 'facility', 'kern'] },
      { op: 'set', path: ['system', 'syslog', 'local', 'facility', 'kern', 'level'], value: 'debug' },
    ])
  })

  it('builds a delete op', () => {
    expect(removeLocalFacilityOp('all')).toEqual({
      op: 'delete',
      path: ['system', 'syslog', 'local', 'facility', 'all'],
    })
  })
})

describe('remote host ops', () => {
  it('creates a remote host with its first facility rule, protocol, and port', () => {
    const ops = addRemoteHostOps('10.0.0.1', 'all', 'debug', 'tcp', '6514')
    expect(ops).toEqual([
      { op: 'set', path: ['system', 'syslog', 'remote', '10.0.0.1', 'facility', 'all'] },
      {
        op: 'set',
        path: ['system', 'syslog', 'remote', '10.0.0.1', 'facility', 'all', 'level'],
        value: 'debug',
      },
      { op: 'set', path: ['system', 'syslog', 'remote', '10.0.0.1', 'protocol'], value: 'tcp' },
      { op: 'set', path: ['system', 'syslog', 'remote', '10.0.0.1', 'port'], value: '6514' },
    ])
  })

  it('omits protocol/port/level when blank', () => {
    const ops = addRemoteHostOps('10.0.0.1', 'all', '', '', '')
    expect(ops).toEqual([{ op: 'set', path: ['system', 'syslog', 'remote', '10.0.0.1', 'facility', 'all'] }])
  })

  it('builds a delete op for the whole remote host', () => {
    expect(deleteRemoteHostOp('10.0.0.1')).toEqual({
      op: 'delete',
      path: ['system', 'syslog', 'remote', '10.0.0.1'],
    })
  })

  it('adds a facility rule to an existing remote host', () => {
    expect(addRemoteFacilityOps('10.0.0.1', 'kern', 'err')).toEqual([
      { op: 'set', path: ['system', 'syslog', 'remote', '10.0.0.1', 'facility', 'kern'] },
      {
        op: 'set',
        path: ['system', 'syslog', 'remote', '10.0.0.1', 'facility', 'kern', 'level'],
        value: 'err',
      },
    ])
  })

  it('removes a facility rule from a remote host', () => {
    expect(removeRemoteFacilityOp('10.0.0.1', 'kern')).toEqual({
      op: 'delete',
      path: ['system', 'syslog', 'remote', '10.0.0.1', 'facility', 'kern'],
    })
  })

  it('sets protocol and port independently', () => {
    expect(setRemoteProtocolOp('10.0.0.1', 'udp')).toEqual({
      op: 'set',
      path: ['system', 'syslog', 'remote', '10.0.0.1', 'protocol'],
      value: 'udp',
    })
    expect(setRemotePortOp('10.0.0.1', '514')).toEqual({
      op: 'set',
      path: ['system', 'syslog', 'remote', '10.0.0.1', 'port'],
      value: '514',
    })
  })
})
