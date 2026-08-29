import { describe, expect, it } from 'vitest'
import {
  broadcastRelayInstancePath,
  broadcastRelayPath,
  parseBroadcastRelayConfig,
} from './serviceBroadcastRelayParse'

describe('parseBroadcastRelayConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseBroadcastRelayConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseBroadcastRelayConfig({}).enabled).toBe(true)
  })

  it('parses the service-level disable flag', () => {
    expect(parseBroadcastRelayConfig({ disable: {} }).disabled).toBe(true)
  })

  it('parses instances with their own disable, address, description, interfaces, and port', () => {
    const relay = {
      id: {
        '5': {
          disable: {},
          address: '192.0.2.1',
          description: 'WoL relay',
          interface: ['eth0', 'eth1'],
          port: '9',
        },
      },
    }
    const config = parseBroadcastRelayConfig(relay)
    expect(config.instances).toEqual([
      {
        id: '5',
        disabled: true,
        address: '192.0.2.1',
        description: 'WoL relay',
        interfaces: ['eth0', 'eth1'],
        port: '9',
      },
    ])
  })

  it('sorts instances numerically, not lexicographically', () => {
    const relay = { id: { '20': {}, '9': {} } }
    const config = parseBroadcastRelayConfig(relay)
    expect(config.instances.map((i) => i.id)).toEqual(['9', '20'])
  })
})

describe('path builders', () => {
  it('builds base and instance paths', () => {
    expect(broadcastRelayPath('disable')).toEqual(['service', 'broadcast-relay', 'disable'])
    expect(broadcastRelayInstancePath('5', 'port')).toEqual(['service', 'broadcast-relay', 'id', '5', 'port'])
  })
})
