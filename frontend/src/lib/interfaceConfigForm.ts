import { bondPath, bridgePath, ethernetPath, vlanPath } from './interfaceParse'
import type {
  BondHashPolicy,
  BondInterface,
  BondLacpRate,
  BondMode,
  BridgeInterface,
  BridgeVlanProtocol,
  EthernetInterface,
  InterfaceVlan,
} from './interfaceTypes'
import type { ConfigOp } from './vyosApi'

/**
 * Diff-based form logic for *editing* an already-existing Ethernet,
 * Bonding, or Bridge interface (or one of their VLAN sub-interfaces) -
 * mirrors firewallRuleForm.ts's approach for editing an existing rule.
 * *Creating* a new Bonding/Bridge interface (or a new VLAN
 * sub-interface) uses the simpler direct-ops pattern instead (see
 * ZonesPage.tsx/GroupsPage.tsx's CreateZoneForm/CreateGroupForm) - a
 * brand new interface's initial fields are just queued directly, no
 * "before" state to diff against yet.
 *
 * Multi-valued fields (addresses, bond members, bridge members) are
 * NOT part of this diff table - like a firewall zone's member
 * interfaces or a group's members, they're edited via direct add/
 * remove ops in the page components, not a single-value diff.
 */

// --- shared "common" fields (address is handled separately - see above) ----

export interface CommonInterfaceFormValues {
  description: string
  disabled: boolean
  mac: string
  /** Numeric string; '' means unset. */
  mtu: string
  vrf: string
}

function blankCommonFormValues(): CommonInterfaceFormValues {
  return { description: '', disabled: false, mac: '', mtu: '', vrf: '' }
}

function commonToFormValues(iface: {
  description?: string
  disabled: boolean
  mac?: string
  mtu?: number
  vrf?: string
}): CommonInterfaceFormValues {
  return {
    description: iface.description ?? '',
    disabled: iface.disabled,
    mac: iface.mac ?? '',
    mtu: iface.mtu !== undefined ? String(iface.mtu) : '',
    vrf: iface.vrf ?? '',
  }
}

interface ScalarField<V> {
  get: (v: V) => string
  segments: string[]
}

interface FlagField<V> {
  get: (v: V) => boolean
  segments: string[]
}

const COMMON_SCALAR_FIELDS: ScalarField<CommonInterfaceFormValues>[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.mac, segments: ['mac'] },
  { get: (v) => v.mtu, segments: ['mtu'] },
  { get: (v) => v.vrf, segments: ['vrf'] },
]

const COMMON_FLAG_FIELDS: FlagField<CommonInterfaceFormValues>[] = [
  { get: (v) => v.disabled, segments: ['disable'] },
]

/** Diffs `before` against `values` field-by-field and returns only the
 * ConfigOps needed to make VyOS match the form - not a full rewrite of
 * every field. */
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

// --- Ethernet ----------------------------------------------------------------

export type EthernetFormValues = CommonInterfaceFormValues

export function blankEthernetFormValues(): EthernetFormValues {
  return blankCommonFormValues()
}

export function ethernetToFormValues(iface: EthernetInterface): EthernetFormValues {
  return commonToFormValues(iface)
}

export function ethernetFormToOps(
  name: string,
  before: EthernetInterface | undefined,
  values: EthernetFormValues,
): ConfigOp[] {
  const beforeValues = before ? ethernetToFormValues(before) : blankEthernetFormValues()
  return diffToOps(ethernetPath(name), COMMON_SCALAR_FIELDS, COMMON_FLAG_FIELDS, beforeValues, values)
}

// --- VLAN sub-interfaces (shared shape across Ethernet/Bonding/Bridge) -------

export type VlanFormValues = CommonInterfaceFormValues

export function blankVlanFormValues(): VlanFormValues {
  return blankCommonFormValues()
}

export function vlanToFormValues(vlan: InterfaceVlan): VlanFormValues {
  return commonToFormValues(vlan)
}

export function vlanFormToOps(
  parentPath: string[],
  vlanId: string,
  before: InterfaceVlan | undefined,
  values: VlanFormValues,
): ConfigOp[] {
  const beforeValues = before ? vlanToFormValues(before) : blankVlanFormValues()
  return diffToOps(
    vlanPath(parentPath, vlanId),
    COMMON_SCALAR_FIELDS,
    COMMON_FLAG_FIELDS,
    beforeValues,
    values,
  )
}

// --- Bonding -------------------------------------------------------------------

export interface BondFormValues extends CommonInterfaceFormValues {
  mode: BondMode
  hashPolicy: BondHashPolicy | ''
  primary: string
  lacpRate: BondLacpRate | ''
  /** Numeric string; '' means unset. */
  minLinks: string
}

export function blankBondFormValues(): BondFormValues {
  return { ...blankCommonFormValues(), mode: '802.3ad', hashPolicy: '', primary: '', lacpRate: '', minLinks: '' }
}

export function bondToFormValues(bond: BondInterface): BondFormValues {
  return {
    ...commonToFormValues(bond),
    mode: bond.mode,
    hashPolicy: bond.hashPolicy ?? '',
    primary: bond.primary ?? '',
    lacpRate: bond.lacpRate ?? '',
    minLinks: bond.minLinks !== undefined ? String(bond.minLinks) : '',
  }
}

const BOND_SCALAR_FIELDS: ScalarField<BondFormValues>[] = [
  ...COMMON_SCALAR_FIELDS,
  { get: (v) => v.mode, segments: ['mode'] },
  { get: (v) => v.hashPolicy, segments: ['hash-policy'] },
  { get: (v) => v.primary, segments: ['primary'] },
  { get: (v) => v.lacpRate, segments: ['lacp-rate'] },
  { get: (v) => v.minLinks, segments: ['min-links'] },
]

export function bondFormToOps(
  name: string,
  before: BondInterface | undefined,
  values: BondFormValues,
): ConfigOp[] {
  const beforeValues = before ? bondToFormValues(before) : blankBondFormValues()
  return diffToOps(bondPath(name), BOND_SCALAR_FIELDS, COMMON_FLAG_FIELDS, beforeValues, values)
}

// --- Bridge ----------------------------------------------------------------------

export interface BridgeFormValues extends CommonInterfaceFormValues {
  stp: boolean
  vlanAware: boolean
  vlanProtocol: BridgeVlanProtocol | ''
}

export function blankBridgeFormValues(): BridgeFormValues {
  return { ...blankCommonFormValues(), stp: false, vlanAware: false, vlanProtocol: '' }
}

export function bridgeToFormValues(bridge: BridgeInterface): BridgeFormValues {
  return {
    ...commonToFormValues(bridge),
    stp: bridge.stp,
    vlanAware: bridge.vlanAware,
    vlanProtocol: bridge.vlanProtocol ?? '',
  }
}

const BRIDGE_SCALAR_FIELDS: ScalarField<BridgeFormValues>[] = [
  ...COMMON_SCALAR_FIELDS,
  { get: (v) => v.vlanProtocol, segments: ['protocol'] },
]

const BRIDGE_FLAG_FIELDS: FlagField<BridgeFormValues>[] = [
  ...COMMON_FLAG_FIELDS,
  { get: (v) => v.stp, segments: ['stp'] },
  { get: (v) => v.vlanAware, segments: ['enable-vlan'] },
]

export function bridgeFormToOps(
  name: string,
  before: BridgeInterface | undefined,
  values: BridgeFormValues,
): ConfigOp[] {
  const beforeValues = before ? bridgeToFormValues(before) : blankBridgeFormValues()
  return diffToOps(bridgePath(name), BRIDGE_SCALAR_FIELDS, BRIDGE_FLAG_FIELDS, beforeValues, values)
}
