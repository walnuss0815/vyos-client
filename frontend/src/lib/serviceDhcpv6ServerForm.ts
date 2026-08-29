import {
  dhcpv6PrefixDelegationPath,
  dhcpv6RangePath,
  dhcpv6ServerPath,
  dhcpv6SharedNetworkPath,
  dhcpv6StaticMappingPath,
  dhcpv6SubnetPath,
} from './serviceDhcpv6ServerParse'
import type { DHCPv6ServerConfig, DHCPv6SharedNetwork, DHCPv6Subnet } from './serviceDhcpv6ServerTypes'
import type { ConfigOp } from './vyosApi'

// --- global settings ---------------------------------------------------

export interface DHCPv6GlobalFormValues {
  disabled: boolean
  disableRouteAutoinstall: boolean
  preference: string
  logLevel: string
}

export function blankDHCPv6GlobalFormValues(): DHCPv6GlobalFormValues {
  return { disabled: false, disableRouteAutoinstall: false, preference: '', logLevel: '' }
}

export function dhcpv6ConfigToGlobalFormValues(config: DHCPv6ServerConfig): DHCPv6GlobalFormValues {
  return {
    disabled: config.disabled,
    disableRouteAutoinstall: config.disableRouteAutoinstall,
    preference: config.preference ?? '',
    logLevel: config.logLevel ?? '',
  }
}

export function dhcpv6GlobalFormToOps(
  before: DHCPv6ServerConfig,
  values: DHCPv6GlobalFormValues,
): ConfigOp[] {
  const beforeValues = dhcpv6ConfigToGlobalFormValues(before)
  const ops: ConfigOp[] = []

  if (beforeValues.disabled !== values.disabled) {
    const path = dhcpv6ServerPath('disable')
    ops.push(values.disabled ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.disableRouteAutoinstall !== values.disableRouteAutoinstall) {
    const path = dhcpv6ServerPath('disable-route-autoinstall')
    ops.push(values.disableRouteAutoinstall ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.preference !== values.preference) {
    const path = dhcpv6ServerPath('preference')
    if (values.preference.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.preference.trim() })
  }
  if (beforeValues.logLevel !== values.logLevel) {
    const path = dhcpv6ServerPath('log-level')
    if (values.logLevel.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.logLevel.trim() })
  }

  return ops
}

export function enableDHCPv6ServerOp(): ConfigOp {
  return { op: 'set', path: dhcpv6ServerPath() }
}

export function disableDHCPv6ServerOp(): ConfigOp {
  return { op: 'delete', path: dhcpv6ServerPath() }
}

// --- shared network ------------------------------------------------------

export interface DHCPv6SharedNetworkFormValues {
  disabled: boolean
  description: string
  interface: string
}

export function blankDHCPv6SharedNetworkFormValues(): DHCPv6SharedNetworkFormValues {
  return { disabled: false, description: '', interface: '' }
}

export function dhcpv6SharedNetworkToFormValues(network: DHCPv6SharedNetwork): DHCPv6SharedNetworkFormValues {
  return { disabled: network.disabled, description: network.description ?? '', interface: network.interface ?? '' }
}

export function dhcpv6SharedNetworkFormToOps(
  name: string,
  before: DHCPv6SharedNetwork | undefined,
  values: DHCPv6SharedNetworkFormValues,
): ConfigOp[] {
  const beforeValues = before ? dhcpv6SharedNetworkToFormValues(before) : blankDHCPv6SharedNetworkFormValues()
  const ops: ConfigOp[] = []
  const base = dhcpv6SharedNetworkPath(name)

  if (before === undefined) ops.push({ op: 'set', path: base })

  if (beforeValues.disabled !== values.disabled) {
    const path = [...base, 'disable']
    ops.push(values.disabled ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.description !== values.description) {
    const path = [...base, 'description']
    if (values.description.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.description.trim() })
  }
  if (beforeValues.interface !== values.interface) {
    const path = [...base, 'interface']
    if (values.interface.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.interface.trim() })
  }

  return ops
}

export function deleteDHCPv6SharedNetworkOp(name: string): ConfigOp {
  return { op: 'delete', path: dhcpv6SharedNetworkPath(name) }
}

// --- subnet --------------------------------------------------------------

export interface DHCPv6SubnetFormValues {
  interface: string
  subnetId: string
  leaseDefault: string
  leaseMaximum: string
  leaseMinimum: string
}

export function blankDHCPv6SubnetFormValues(): DHCPv6SubnetFormValues {
  return { interface: '', subnetId: '', leaseDefault: '', leaseMaximum: '', leaseMinimum: '' }
}

export function dhcpv6SubnetToFormValues(subnet: DHCPv6Subnet): DHCPv6SubnetFormValues {
  return {
    interface: subnet.interface ?? '',
    subnetId: subnet.subnetId ?? '',
    leaseDefault: subnet.leaseDefault ?? '',
    leaseMaximum: subnet.leaseMaximum ?? '',
    leaseMinimum: subnet.leaseMinimum ?? '',
  }
}

const SUBNET_SCALAR_FIELDS: { get: (v: DHCPv6SubnetFormValues) => string; segments: string[] }[] = [
  { get: (v) => v.interface, segments: ['interface'] },
  { get: (v) => v.subnetId, segments: ['subnet-id'] },
  { get: (v) => v.leaseDefault, segments: ['lease-time', 'default'] },
  { get: (v) => v.leaseMaximum, segments: ['lease-time', 'maximum'] },
  { get: (v) => v.leaseMinimum, segments: ['lease-time', 'minimum'] },
]

export function dhcpv6SubnetFormToOps(
  networkName: string,
  cidr: string,
  before: DHCPv6Subnet | undefined,
  values: DHCPv6SubnetFormValues,
): ConfigOp[] {
  const beforeValues = before ? dhcpv6SubnetToFormValues(before) : blankDHCPv6SubnetFormValues()
  const ops: ConfigOp[] = []
  const base = dhcpv6SubnetPath(networkName, cidr)

  if (before === undefined) ops.push({ op: 'set', path: base })

  for (const field of SUBNET_SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function deleteDHCPv6SubnetOp(networkName: string, cidr: string): ConfigOp {
  return { op: 'delete', path: dhcpv6SubnetPath(networkName, cidr) }
}

// --- range -----------------------------------------------------------------

export function addDHCPv6RangeOps(
  networkName: string,
  cidr: string,
  id: string,
  prefix: string,
  start: string,
  stop: string,
): ConfigOp[] {
  const base = dhcpv6RangePath(networkName, cidr, id)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (prefix.trim()) ops.push({ op: 'set', path: [...base, 'prefix'], value: prefix.trim() })
  if (start.trim()) ops.push({ op: 'set', path: [...base, 'start'], value: start.trim() })
  if (stop.trim()) ops.push({ op: 'set', path: [...base, 'stop'], value: stop.trim() })
  return ops
}

export function removeDHCPv6RangeOp(networkName: string, cidr: string, id: string): ConfigOp {
  return { op: 'delete', path: dhcpv6RangePath(networkName, cidr, id) }
}

// --- static mapping ----------------------------------------------------

export function addDHCPv6StaticMappingOps(
  networkName: string,
  cidr: string,
  hostname: string,
  options: { mac: string; duid: string; disabled: boolean },
): ConfigOp[] {
  const base = dhcpv6StaticMappingPath(networkName, cidr, hostname)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.mac.trim()) ops.push({ op: 'set', path: [...base, 'mac'], value: options.mac.trim() })
  if (options.duid.trim()) ops.push({ op: 'set', path: [...base, 'duid'], value: options.duid.trim() })
  if (options.disabled) ops.push({ op: 'set', path: [...base, 'disable'] })
  return ops
}

export function removeDHCPv6StaticMappingOp(networkName: string, cidr: string, hostname: string): ConfigOp {
  return { op: 'delete', path: dhcpv6StaticMappingPath(networkName, cidr, hostname) }
}

// --- prefix delegation -------------------------------------------------

export function addDHCPv6PrefixDelegationOps(
  networkName: string,
  cidr: string,
  prefix: string,
  options: { prefixLength: string; delegatedLength: string; excludedPrefix: string; excludedPrefixLength: string },
): ConfigOp[] {
  const base = dhcpv6PrefixDelegationPath(networkName, cidr, prefix)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.prefixLength.trim()) {
    ops.push({ op: 'set', path: [...base, 'prefix-length'], value: options.prefixLength.trim() })
  }
  if (options.delegatedLength.trim()) {
    ops.push({ op: 'set', path: [...base, 'delegated-length'], value: options.delegatedLength.trim() })
  }
  if (options.excludedPrefix.trim()) {
    ops.push({ op: 'set', path: [...base, 'excluded-prefix'], value: options.excludedPrefix.trim() })
  }
  if (options.excludedPrefixLength.trim()) {
    ops.push({ op: 'set', path: [...base, 'excluded-prefix-length'], value: options.excludedPrefixLength.trim() })
  }
  return ops
}

export function removeDHCPv6PrefixDelegationOp(networkName: string, cidr: string, prefix: string): ConfigOp {
  return { op: 'delete', path: dhcpv6PrefixDelegationPath(networkName, cidr, prefix) }
}
