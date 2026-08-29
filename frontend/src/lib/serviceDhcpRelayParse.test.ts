import { describe, expect, it } from 'vitest'
import {
  dhcpRelayOptionsPath,
  dhcpRelayPath,
  dhcpv6RelayListenInterfacePath,
  dhcpv6RelayPath,
  dhcpv6RelayUpstreamInterfacePath,
  parseDHCPRelayConfig,
  parseDHCPv6RelayConfig,
} from './serviceDhcpRelayParse'

describe('parseDHCPRelayConfig', () => {
  it('returns a blank config when absent', () => {
    expect(parseDHCPRelayConfig(undefined)).toEqual({
      disabled: false,
      interfaces: [],
      listenInterfaces: [],
      upstreamInterfaces: [],
      servers: [],
    })
  })

  it('parses interfaces, servers, disable, and relay-options', () => {
    const relay = {
      disable: {},
      interface: ['eth0'],
      'listen-interface': ['eth1'],
      'upstream-interface': ['eth2'],
      'relay-options': { 'hop-count': '5', 'max-size': '600', 'relay-agents-packets': 'replace' },
      server: ['192.0.2.1', '192.0.2.2'],
    }
    const config = parseDHCPRelayConfig(relay)
    expect(config).toEqual({
      disabled: true,
      interfaces: ['eth0'],
      listenInterfaces: ['eth1'],
      upstreamInterfaces: ['eth2'],
      hopCount: '5',
      maxSize: '600',
      relayAgentsPackets: 'replace',
      servers: ['192.0.2.1', '192.0.2.2'],
    })
  })
})

describe('parseDHCPv6RelayConfig', () => {
  it('returns a blank config when absent', () => {
    expect(parseDHCPv6RelayConfig(undefined)).toEqual({
      disabled: false,
      listenInterfaces: [],
      upstreamInterfaces: [],
      useInterfaceIdOption: false,
    })
  })

  it('parses listen-interface as single-address and upstream-interface as multi-address', () => {
    const relay = {
      'listen-interface': { eth0: { address: 'fe80::1' } },
      'upstream-interface': { eth1: { address: ['2001:db8::1', '2001:db8::2'] } },
      'max-hop-count': '5',
      'use-interface-id-option': {},
    }
    const config = parseDHCPv6RelayConfig(relay)
    expect(config.listenInterfaces).toEqual([{ interfaceName: 'eth0', address: 'fe80::1' }])
    expect(config.upstreamInterfaces).toEqual([
      { interfaceName: 'eth1', addresses: ['2001:db8::1', '2001:db8::2'] },
    ])
    expect(config.maxHopCount).toBe('5')
    expect(config.useInterfaceIdOption).toBe(true)
  })

  it('sorts listen/upstream interfaces by name', () => {
    const relay = {
      'listen-interface': { eth1: {}, eth0: {} },
    }
    const config = parseDHCPv6RelayConfig(relay)
    expect(config.listenInterfaces.map((i) => i.interfaceName)).toEqual(['eth0', 'eth1'])
  })
})

describe('path builders', () => {
  it('builds dhcp-relay paths', () => {
    expect(dhcpRelayPath('disable')).toEqual(['service', 'dhcp-relay', 'disable'])
    expect(dhcpRelayOptionsPath('hop-count')).toEqual([
      'service',
      'dhcp-relay',
      'relay-options',
      'hop-count',
    ])
  })

  it('builds dhcpv6-relay paths', () => {
    expect(dhcpv6RelayPath('max-hop-count')).toEqual(['service', 'dhcpv6-relay', 'max-hop-count'])
    expect(dhcpv6RelayListenInterfacePath('eth0', 'address')).toEqual([
      'service',
      'dhcpv6-relay',
      'listen-interface',
      'eth0',
      'address',
    ])
    expect(dhcpv6RelayUpstreamInterfacePath('eth1', 'address')).toEqual([
      'service',
      'dhcpv6-relay',
      'upstream-interface',
      'eth1',
      'address',
    ])
  })
})
