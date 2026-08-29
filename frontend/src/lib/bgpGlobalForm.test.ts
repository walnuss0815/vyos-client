import { describe, expect, it } from 'vitest'
import {
  addNetworkOp,
  addRedistributionOps,
  blankGlobalFormValues,
  globalFormToOps,
  globalToFormValues,
  removeNetworkOp,
  removeRedistributionOp,
} from './bgpGlobalForm'
import type { BGPConfig } from './bgpTypes'

function emptyConfig(overrides: Partial<BGPConfig> = {}): BGPConfig {
  return {
    neighbors: [],
    peerGroups: [],
    networks: [],
    redistributions: [],
    ...overrides,
  }
}

describe('globalToFormValues / globalFormToOps', () => {
  it('normalizes undefined systemAs/routerId to empty strings', () => {
    expect(globalToFormValues(emptyConfig())).toEqual(blankGlobalFormValues())
  })

  it('queues nothing when unchanged', () => {
    const config = emptyConfig({ systemAs: '64512', routerId: '192.0.2.1' })
    const ops = globalFormToOps(config, globalToFormValues(config))
    expect(ops).toEqual([])
  })

  it('queues a set for a changed systemAs', () => {
    const config = emptyConfig({ systemAs: '64512' })
    const values = globalToFormValues(config)
    values.systemAs = '64513'
    const ops = globalFormToOps(config, values)
    expect(ops).toEqual([{ op: 'set', path: ['protocols', 'bgp', 'system-as'], value: '64513' }])
  })

  it('queues a set for a newly-added routerId under parameters', () => {
    const config = emptyConfig()
    const values = globalToFormValues(config)
    values.routerId = '192.0.2.1'
    const ops = globalFormToOps(config, values)
    expect(ops).toEqual([
      { op: 'set', path: ['protocols', 'bgp', 'parameters', 'router-id'], value: '192.0.2.1' },
    ])
  })

  it('queues a delete when routerId is cleared', () => {
    const config = emptyConfig({ routerId: '192.0.2.1' })
    const values = globalToFormValues(config)
    values.routerId = ''
    const ops = globalFormToOps(config, values)
    expect(ops).toEqual([{ op: 'delete', path: ['protocols', 'bgp', 'parameters', 'router-id'] }])
  })

  // Regression test: this used to check the raw (untrimmed) value, so
  // whitespace-only input queued a `set` with a literal whitespace
  // value instead of being treated the same as actually clearing the
  // field - inconsistent with sibling forms (e.g.
  // loadBalancingHaproxyForm.ts) that already trimmed.
  it('treats a whitespace-only systemAs/routerId the same as clearing it', () => {
    const config = emptyConfig({ systemAs: '64512', routerId: '192.0.2.1' })
    const values = globalToFormValues(config)
    values.systemAs = '   '
    values.routerId = '  '
    const ops = globalFormToOps(config, values)
    expect(ops).toEqual([
      { op: 'delete', path: ['protocols', 'bgp', 'system-as'] },
      { op: 'delete', path: ['protocols', 'bgp', 'parameters', 'router-id'] },
    ])
  })
})

describe('network advertisement ops', () => {
  it('builds a set op for adding an ipv4 network', () => {
    expect(addNetworkOp('ipv4', '198.51.100.0/24')).toEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'address-family', 'ipv4-unicast', 'network', '198.51.100.0/24'],
    })
  })

  it('builds a set op for adding an ipv6 network', () => {
    expect(addNetworkOp('ipv6', '2001:db8::/32')).toEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'address-family', 'ipv6-unicast', 'network', '2001:db8::/32'],
    })
  })

  it('builds a delete op for removing a network', () => {
    expect(removeNetworkOp('ipv4', '198.51.100.0/24')).toEqual({
      op: 'delete',
      path: ['protocols', 'bgp', 'address-family', 'ipv4-unicast', 'network', '198.51.100.0/24'],
    })
  })
})

describe('redistribution ops', () => {
  it('builds a bare set op when no metric is given', () => {
    expect(addRedistributionOps('ipv4', 'static', '')).toEqual([
      { op: 'set', path: ['protocols', 'bgp', 'address-family', 'ipv4-unicast', 'redistribute', 'static'] },
    ])
  })

  it('builds a set op plus a metric set op when a metric is given', () => {
    expect(addRedistributionOps('ipv4', 'static', '100')).toEqual([
      { op: 'set', path: ['protocols', 'bgp', 'address-family', 'ipv4-unicast', 'redistribute', 'static'] },
      {
        op: 'set',
        path: [
          'protocols',
          'bgp',
          'address-family',
          'ipv4-unicast',
          'redistribute',
          'static',
          'metric',
        ],
        value: '100',
      },
    ])
  })

  it('trims whitespace-only metrics down to no metric op', () => {
    expect(addRedistributionOps('ipv4', 'static', '   ')).toEqual([
      { op: 'set', path: ['protocols', 'bgp', 'address-family', 'ipv4-unicast', 'redistribute', 'static'] },
    ])
  })

  it('builds a delete op for removing a redistribution source', () => {
    expect(removeRedistributionOp('ipv6', 'connected')).toEqual({
      op: 'delete',
      path: ['protocols', 'bgp', 'address-family', 'ipv6-unicast', 'redistribute', 'connected'],
    })
  })
})
