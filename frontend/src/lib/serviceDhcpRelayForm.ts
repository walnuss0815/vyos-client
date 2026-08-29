import {
  dhcpRelayOptionsPath,
  dhcpRelayPath,
  dhcpv6RelayListenInterfacePath,
  dhcpv6RelayPath,
  dhcpv6RelayUpstreamInterfacePath,
} from './serviceDhcpRelayParse'
import type { DHCPRelayConfig, DHCPv6RelayConfig } from './serviceDhcpRelayTypes'
import type { ConfigOp } from './vyosApi'

// --- DHCPv4 relay --------------------------------------------------------

export interface DHCPRelaySettingsFormValues {
  disabled: boolean
  hopCount: string
  maxSize: string
  relayAgentsPackets: string
}

export function blankDHCPRelaySettingsFormValues(): DHCPRelaySettingsFormValues {
  return { disabled: false, hopCount: '', maxSize: '', relayAgentsPackets: '' }
}

export function dhcpRelayConfigToFormValues(config: DHCPRelayConfig): DHCPRelaySettingsFormValues {
  return {
    disabled: config.disabled,
    hopCount: config.hopCount ?? '',
    maxSize: config.maxSize ?? '',
    relayAgentsPackets: config.relayAgentsPackets ?? '',
  }
}

export function dhcpRelaySettingsFormToOps(
  before: DHCPRelayConfig,
  values: DHCPRelaySettingsFormValues,
): ConfigOp[] {
  const beforeValues = dhcpRelayConfigToFormValues(before)
  const ops: ConfigOp[] = []

  if (beforeValues.disabled !== values.disabled) {
    const path = dhcpRelayPath('disable')
    ops.push(values.disabled ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: DHCPRelaySettingsFormValues) => string; path: string[] }[] = [
    { get: (v) => v.hopCount, path: dhcpRelayOptionsPath('hop-count') },
    { get: (v) => v.maxSize, path: dhcpRelayOptionsPath('max-size') },
    { get: (v) => v.relayAgentsPackets, path: dhcpRelayOptionsPath('relay-agents-packets') },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    if (newValue.trim() === '') ops.push({ op: 'delete', path: field.path })
    else ops.push({ op: 'set', path: field.path, value: newValue.trim() })
  }

  return ops
}

// --- DHCPv6 relay ----------------------------------------------------------

export interface DHCPv6RelaySettingsFormValues {
  disabled: boolean
  maxHopCount: string
  useInterfaceIdOption: boolean
}

export function blankDHCPv6RelaySettingsFormValues(): DHCPv6RelaySettingsFormValues {
  return { disabled: false, maxHopCount: '', useInterfaceIdOption: false }
}

export function dhcpv6RelayConfigToFormValues(config: DHCPv6RelayConfig): DHCPv6RelaySettingsFormValues {
  return {
    disabled: config.disabled,
    maxHopCount: config.maxHopCount ?? '',
    useInterfaceIdOption: config.useInterfaceIdOption,
  }
}

export function dhcpv6RelaySettingsFormToOps(
  before: DHCPv6RelayConfig,
  values: DHCPv6RelaySettingsFormValues,
): ConfigOp[] {
  const beforeValues = dhcpv6RelayConfigToFormValues(before)
  const ops: ConfigOp[] = []

  if (beforeValues.disabled !== values.disabled) {
    const path = dhcpv6RelayPath('disable')
    ops.push(values.disabled ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.useInterfaceIdOption !== values.useInterfaceIdOption) {
    const path = dhcpv6RelayPath('use-interface-id-option')
    ops.push(values.useInterfaceIdOption ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.maxHopCount !== values.maxHopCount) {
    const path = dhcpv6RelayPath('max-hop-count')
    if (values.maxHopCount.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.maxHopCount.trim() })
  }

  return ops
}

export function addDHCPv6RelayListenInterfaceOps(interfaceName: string, address: string): ConfigOp[] {
  const base = dhcpv6RelayListenInterfacePath(interfaceName)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const trimmedAddress = address.trim()
  if (trimmedAddress) ops.push({ op: 'set', path: [...base, 'address'], value: trimmedAddress })
  return ops
}

export function removeDHCPv6RelayListenInterfaceOp(interfaceName: string): ConfigOp {
  return { op: 'delete', path: dhcpv6RelayListenInterfacePath(interfaceName) }
}

export function addDHCPv6RelayUpstreamInterfaceOp(interfaceName: string): ConfigOp {
  return { op: 'set', path: dhcpv6RelayUpstreamInterfacePath(interfaceName) }
}

export function removeDHCPv6RelayUpstreamInterfaceOp(interfaceName: string): ConfigOp {
  return { op: 'delete', path: dhcpv6RelayUpstreamInterfacePath(interfaceName) }
}
