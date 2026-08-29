import { describe, expect, it } from 'vitest'
import {
  addDHCPv6RelayListenInterfaceOps,
  addDHCPv6RelayUpstreamInterfaceOp,
  blankDHCPRelaySettingsFormValues,
  blankDHCPv6RelaySettingsFormValues,
  dhcpRelayConfigToFormValues,
  dhcpRelaySettingsFormToOps,
  dhcpv6RelayConfigToFormValues,
  dhcpv6RelaySettingsFormToOps,
  removeDHCPv6RelayListenInterfaceOp,
  removeDHCPv6RelayUpstreamInterfaceOp,
} from './serviceDhcpRelayForm'
import { blankDHCPRelayConfig, blankDHCPv6RelayConfig } from './serviceDhcpRelayTypes'

describe('dhcpRelaySettingsFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(dhcpRelaySettingsFormToOps(blankDHCPRelayConfig(), blankDHCPRelaySettingsFormValues())).toEqual([])
  })

  it('queues disable and relay-options fields', () => {
    const values = blankDHCPRelaySettingsFormValues()
    values.disabled = true
    values.hopCount = '5'
    values.relayAgentsPackets = 'replace'

    expect(dhcpRelaySettingsFormToOps(blankDHCPRelayConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'dhcp-relay', 'disable'] },
      { op: 'set', path: ['service', 'dhcp-relay', 'relay-options', 'hop-count'], value: '5' },
      {
        op: 'set',
        path: ['service', 'dhcp-relay', 'relay-options', 'relay-agents-packets'],
        value: 'replace',
      },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const before = { ...blankDHCPRelayConfig(), hopCount: '5' }
    const values = dhcpRelayConfigToFormValues(before)
    values.hopCount = ''

    expect(dhcpRelaySettingsFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'dhcp-relay', 'relay-options', 'hop-count'] },
    ])
  })
})

describe('dhcpv6RelaySettingsFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(
      dhcpv6RelaySettingsFormToOps(blankDHCPv6RelayConfig(), blankDHCPv6RelaySettingsFormValues()),
    ).toEqual([])
  })

  it('queues disable, use-interface-id-option, and max-hop-count', () => {
    const values = blankDHCPv6RelaySettingsFormValues()
    values.disabled = true
    values.useInterfaceIdOption = true
    values.maxHopCount = '5'

    expect(dhcpv6RelaySettingsFormToOps(blankDHCPv6RelayConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'dhcpv6-relay', 'disable'] },
      { op: 'set', path: ['service', 'dhcpv6-relay', 'use-interface-id-option'] },
      { op: 'set', path: ['service', 'dhcpv6-relay', 'max-hop-count'], value: '5' },
    ])
  })

  it('queues a delete when unchecked', () => {
    const before = { ...blankDHCPv6RelayConfig(), useInterfaceIdOption: true }
    const values = dhcpv6RelayConfigToFormValues(before)
    values.useInterfaceIdOption = false

    expect(dhcpv6RelaySettingsFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'dhcpv6-relay', 'use-interface-id-option'] },
    ])
  })
})

describe('DHCPv6 relay listen-interface ops', () => {
  it('always sets the tag, optionally with address', () => {
    expect(addDHCPv6RelayListenInterfaceOps('eth0', '')).toEqual([
      { op: 'set', path: ['service', 'dhcpv6-relay', 'listen-interface', 'eth0'] },
    ])
    expect(addDHCPv6RelayListenInterfaceOps('eth0', 'fe80::1')).toEqual([
      { op: 'set', path: ['service', 'dhcpv6-relay', 'listen-interface', 'eth0'] },
      { op: 'set', path: ['service', 'dhcpv6-relay', 'listen-interface', 'eth0', 'address'], value: 'fe80::1' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeDHCPv6RelayListenInterfaceOp('eth0')).toEqual({
      op: 'delete',
      path: ['service', 'dhcpv6-relay', 'listen-interface', 'eth0'],
    })
  })
})

describe('DHCPv6 relay upstream-interface ops', () => {
  it('sets the tag (addresses managed separately via ChipList)', () => {
    expect(addDHCPv6RelayUpstreamInterfaceOp('eth1')).toEqual({
      op: 'set',
      path: ['service', 'dhcpv6-relay', 'upstream-interface', 'eth1'],
    })
  })

  it('builds a remove op', () => {
    expect(removeDHCPv6RelayUpstreamInterfaceOp('eth1')).toEqual({
      op: 'delete',
      path: ['service', 'dhcpv6-relay', 'upstream-interface', 'eth1'],
    })
  })
})
