import { describe, expect, it } from 'vitest'
import {
  addWANHealthTestOps,
  addWANRuleInterfaceOps,
  blankInterfaceHealthFormValues,
  blankWANRuleFormValues,
  deleteWANRuleOp,
  interfaceHealthFormToOps,
  interfaceHealthToFormValues,
  removeInterfaceHealthOp,
  removeWANHealthTestOp,
  removeWANRuleInterfaceOp,
  setWANHookOp,
  toggleFlushConnectionsOp,
  toggleStickyInboundOp,
  wanRuleFormToOps,
  wanRuleToFormValues,
} from './loadBalancingWanForm'
import type { WANInterfaceHealth, WANRule } from './loadBalancingTypes'

describe('WAN global toggles', () => {
  it('sets or deletes a flag based on the new value', () => {
    expect(toggleFlushConnectionsOp(true)).toEqual({ op: 'set', path: ['load-balancing', 'wan', 'flush-connections'] })
    expect(toggleFlushConnectionsOp(false)).toEqual({ op: 'delete', path: ['load-balancing', 'wan', 'flush-connections'] })
  })

  it('sticky-connections inbound uses its nested path', () => {
    expect(toggleStickyInboundOp(true)).toEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'sticky-connections', 'inbound'],
    })
  })

  it('setWANHookOp deletes on blank, sets a trimmed value otherwise', () => {
    expect(setWANHookOp('  ')).toEqual({ op: 'delete', path: ['load-balancing', 'wan', 'hook'] })
    expect(setWANHookOp(' /config/scripts/hook.sh ')).toEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'hook'],
      value: '/config/scripts/hook.sh',
    })
  })
})

describe('interface-health form', () => {
  it('creates a new entry with a bare set followed by scalar sets', () => {
    const ops = interfaceHealthFormToOps('eth0', undefined, {
      nexthop: '192.0.2.1',
      failureCount: '3',
      successCount: '',
    })
    expect(ops[0]).toEqual({ op: 'set', path: ['load-balancing', 'wan', 'interface-health', 'eth0'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'interface-health', 'eth0', 'nexthop'],
      value: '192.0.2.1',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'interface-health', 'eth0', 'failure-count'],
      value: '3',
    })
    // successCount left blank on a *new* entry: still diffed against
    // blankInterfaceHealthFormValues()'s own '' default, so no-op.
    expect(ops.some((o) => o.path.at(-1) === 'success-count')).toBe(false)
  })

  it('only emits ops for fields that actually changed when editing', () => {
    const before: WANInterfaceHealth = {
      interface: 'eth0',
      nexthop: '192.0.2.1',
      failureCount: 1,
      successCount: 1,
      tests: [],
    }
    const values = interfaceHealthToFormValues(before)
    values.failureCount = '5'
    const ops = interfaceHealthFormToOps('eth0', before, values)
    expect(ops).toEqual([
      { op: 'set', path: ['load-balancing', 'wan', 'interface-health', 'eth0', 'failure-count'], value: '5' },
    ])
  })

  it('removeInterfaceHealthOp deletes the whole tagNode', () => {
    expect(removeInterfaceHealthOp('eth0')).toEqual({
      op: 'delete',
      path: ['load-balancing', 'wan', 'interface-health', 'eth0'],
    })
  })

  it('blank form values default every field to an empty string', () => {
    expect(blankInterfaceHealthFormValues()).toEqual({ nexthop: '', failureCount: '', successCount: '' })
  })
})

describe('WAN health tests', () => {
  it('addWANHealthTestOps only sets fields that were actually provided', () => {
    const ops = addWANHealthTestOps('eth0', '0', {
      type: 'ping',
      target: '9.9.9.9',
      testScript: '',
      respTime: '',
      ttlLimit: '',
    })
    expect(ops).toEqual([
      { op: 'set', path: ['load-balancing', 'wan', 'interface-health', 'eth0', 'test', '0'] },
      { op: 'set', path: ['load-balancing', 'wan', 'interface-health', 'eth0', 'test', '0', 'type'], value: 'ping' },
      { op: 'set', path: ['load-balancing', 'wan', 'interface-health', 'eth0', 'test', '0', 'target'], value: '9.9.9.9' },
    ])
  })

  it('removeWANHealthTestOp deletes the test tagNode', () => {
    expect(removeWANHealthTestOp('eth0', '0')).toEqual({
      op: 'delete',
      path: ['load-balancing', 'wan', 'interface-health', 'eth0', 'test', '0'],
    })
  })
})

describe('WAN rule form', () => {
  it('creates a new rule with match fields, flags, and a limit block', () => {
    const values = blankWANRuleFormValues()
    values.description = 'primary'
    values.failover = true
    values.source = { address: '10.0.0.0/24' }
    values.limitRate = '10'
    values.limitBurst = '20'
    const ops = wanRuleFormToOps('10', undefined, values)

    expect(ops[0]).toEqual({ op: 'set', path: ['load-balancing', 'wan', 'rule', '10'] })
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'wan', 'rule', '10', 'failover'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'rule', '10', 'description'],
      value: 'primary',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'rule', '10', 'source', 'address'],
      value: '10.0.0.0/24',
    })
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'wan', 'rule', '10', 'limit'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'rule', '10', 'limit', 'rate'],
      value: '10',
    })
  })

  it('removes the limit node entirely when both rate and burst are cleared', () => {
    const before: WANRule = {
      id: '10',
      source: {},
      destination: {},
      exclude: false,
      failover: false,
      interfaces: [],
      perPacketBalancing: false,
      protocol: 'all',
      limit: { rate: 10, period: 'second', burst: 20, threshold: 'below' },
    }
    const values = wanRuleToFormValues(before)
    values.limitRate = ''
    values.limitBurst = ''
    const ops = wanRuleFormToOps('10', before, values)
    expect(ops).toEqual([{ op: 'delete', path: ['load-balancing', 'wan', 'rule', '10', 'limit'] }])
  })

  it('emits nothing when editing with no actual changes', () => {
    const before: WANRule = {
      id: '10',
      description: 'primary',
      source: { address: '10.0.0.0/24' },
      destination: {},
      exclude: false,
      failover: true,
      interfaces: [],
      perPacketBalancing: false,
      protocol: 'tcp',
    }
    const ops = wanRuleFormToOps('10', before, wanRuleToFormValues(before))
    expect(ops).toEqual([])
  })

  it('deleteWANRuleOp deletes the whole rule tagNode', () => {
    expect(deleteWANRuleOp('10')).toEqual({ op: 'delete', path: ['load-balancing', 'wan', 'rule', '10'] })
  })
})

describe('WAN rule interfaces (nested list)', () => {
  it('addWANRuleInterfaceOps sets weight only when provided', () => {
    expect(addWANRuleInterfaceOps('10', 'eth0', '5')).toEqual([
      { op: 'set', path: ['load-balancing', 'wan', 'rule', '10', 'interface', 'eth0'] },
      { op: 'set', path: ['load-balancing', 'wan', 'rule', '10', 'interface', 'eth0', 'weight'], value: '5' },
    ])
    expect(addWANRuleInterfaceOps('10', 'eth1', '')).toEqual([
      { op: 'set', path: ['load-balancing', 'wan', 'rule', '10', 'interface', 'eth1'] },
    ])
  })

  it('removeWANRuleInterfaceOp deletes the interface tagNode', () => {
    expect(removeWANRuleInterfaceOp('10', 'eth0')).toEqual({
      op: 'delete',
      path: ['load-balancing', 'wan', 'rule', '10', 'interface', 'eth0'],
    })
  })
})
