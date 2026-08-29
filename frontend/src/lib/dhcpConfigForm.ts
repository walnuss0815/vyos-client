import { sharedNetworkPath, staticMappingPath, subnetPath } from './dhcpConfigParse'
import type { DHCPOptions, DHCPSharedNetwork, DHCPStaticMapping, DHCPSubnet } from './dhcpConfigTypes'
import type { ConfigOp } from './vyosApi'

/**
 * Diff-based form logic for *editing* an already-existing shared
 * network, subnet, or static mapping - mirrors interfaceConfigForm.ts/
 * firewallRuleForm.ts's approach exactly. *Creating* a new shared
 * network, subnet, range, or static mapping uses the simpler
 * direct-ops pattern instead (ZonesPage/GroupsPage's Create*Form
 * style), same reasoning as Interfaces: there's no "before" state to
 * diff against yet.
 *
 * Multi-valued option fields (name-server, ntp-server, domain-search)
 * are NOT part of this diff table - like an interface's addresses,
 * they're edited via direct add/remove ops (see components/ChipList.tsx),
 * queued immediately rather than batched behind a Save button. Ranges
 * and excludes are similarly direct-ops, not diffed.
 */

interface ScalarField<V> {
  get: (v: V) => string
  segments: string[]
}

interface FlagField<V> {
  get: (v: V) => boolean
  segments: string[]
}

function diffToOps<V>(
  basePath: string[],
  scalarFields: ScalarField<V>[],
  flagFields: FlagField<V>[],
  before: V,
  values: V,
): ConfigOp[] {
  const ops: ConfigOp[] = []

  for (const field of scalarFields) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...basePath, ...field.segments]
    if (newValue.trim() === '') {
      ops.push({ op: 'delete', path })
    } else {
      ops.push({ op: 'set', path, value: newValue.trim() })
    }
  }

  for (const field of flagFields) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...basePath, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  return ops
}

// --- options (the two true scalars among the 5 covered options) --------------

export interface DHCPOptionsFormValues {
  defaultRouter: string
  domainName: string
}

function blankOptionsFormValues(): DHCPOptionsFormValues {
  return { defaultRouter: '', domainName: '' }
}

function optionsToFormValues(options: DHCPOptions): DHCPOptionsFormValues {
  return { defaultRouter: options.defaultRouter ?? '', domainName: options.domainName ?? '' }
}

const OPTIONS_SCALAR_FIELDS: ScalarField<DHCPOptionsFormValues>[] = [
  { get: (v) => v.defaultRouter, segments: ['option', 'default-router'] },
  { get: (v) => v.domainName, segments: ['option', 'domain-name'] },
]

// --- shared network ------------------------------------------------------------

export interface SharedNetworkFormValues extends DHCPOptionsFormValues {
  authoritative: boolean
}

export function blankSharedNetworkFormValues(): SharedNetworkFormValues {
  return { ...blankOptionsFormValues(), authoritative: false }
}

export function sharedNetworkToFormValues(network: DHCPSharedNetwork): SharedNetworkFormValues {
  return { ...optionsToFormValues(network.options), authoritative: network.authoritative }
}

const SHARED_NETWORK_FLAG_FIELDS: FlagField<SharedNetworkFormValues>[] = [
  { get: (v) => v.authoritative, segments: ['authoritative'] },
]

export function sharedNetworkFormToOps(
  name: string,
  before: DHCPSharedNetwork | undefined,
  values: SharedNetworkFormValues,
): ConfigOp[] {
  const beforeValues = before ? sharedNetworkToFormValues(before) : blankSharedNetworkFormValues()
  return diffToOps(sharedNetworkPath(name), OPTIONS_SCALAR_FIELDS, SHARED_NETWORK_FLAG_FIELDS, beforeValues, values)
}

// --- subnet ----------------------------------------------------------------------

export interface SubnetFormValues extends DHCPOptionsFormValues {
  subnetId: string
  /** Numeric string (seconds); '' means unset (VyOS defaults to 86400). */
  lease: string
}

export function blankSubnetFormValues(): SubnetFormValues {
  return { ...blankOptionsFormValues(), subnetId: '', lease: '' }
}

export function subnetToFormValues(subnet: DHCPSubnet): SubnetFormValues {
  return {
    ...optionsToFormValues(subnet.options),
    subnetId: subnet.subnetId ?? '',
    lease: subnet.lease !== undefined ? String(subnet.lease) : '',
  }
}

const SUBNET_SCALAR_FIELDS: ScalarField<SubnetFormValues>[] = [
  ...OPTIONS_SCALAR_FIELDS,
  { get: (v) => v.subnetId, segments: ['subnet-id'] },
  { get: (v) => v.lease, segments: ['lease'] },
]

export function subnetFormToOps(
  networkName: string,
  cidr: string,
  before: DHCPSubnet | undefined,
  values: SubnetFormValues,
): ConfigOp[] {
  const beforeValues = before ? subnetToFormValues(before) : blankSubnetFormValues()
  return diffToOps(subnetPath(networkName, cidr), SUBNET_SCALAR_FIELDS, [], beforeValues, values)
}

// --- static mapping --------------------------------------------------------------

export interface StaticMappingFormValues {
  mac: string
  duid: string
  ipAddress: string
}

export function blankStaticMappingFormValues(): StaticMappingFormValues {
  return { mac: '', duid: '', ipAddress: '' }
}

export function staticMappingToFormValues(mapping: DHCPStaticMapping): StaticMappingFormValues {
  return { mac: mapping.mac ?? '', duid: mapping.duid ?? '', ipAddress: mapping.ipAddress ?? '' }
}

const STATIC_MAPPING_SCALAR_FIELDS: ScalarField<StaticMappingFormValues>[] = [
  { get: (v) => v.mac, segments: ['mac'] },
  { get: (v) => v.duid, segments: ['duid'] },
  { get: (v) => v.ipAddress, segments: ['ip-address'] },
]

export function staticMappingFormToOps(
  networkName: string,
  cidr: string,
  mappingName: string,
  before: DHCPStaticMapping | undefined,
  values: StaticMappingFormValues,
): ConfigOp[] {
  const beforeValues = before ? staticMappingToFormValues(before) : blankStaticMappingFormValues()
  return diffToOps(
    staticMappingPath(networkName, cidr, mappingName),
    STATIC_MAPPING_SCALAR_FIELDS,
    [],
    beforeValues,
    values,
  )
}
