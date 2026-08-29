import {
  BOND_HASH_POLICIES,
  BOND_LACP_RATES,
  BOND_MODES,
  BRIDGE_VLAN_PROTOCOLS,
  type BondHashPolicy,
  type BondInterface,
  type BondLacpRate,
  type BondMode,
  type BridgeInterface,
  type BridgeMember,
  type BridgeVlanProtocol,
  type EthernetInterface,
  type InterfaceVlan,
  type Vrf,
} from './interfaceTypes'

// --- generic VyOS JSON-tree helpers (mirrors firewallParse.ts) ---------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** VyOS represents a single-valued leaf as a bare string and a
 * multi-valued leaf as an array; this normalizes either into an array. */
function asArray(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (Array.isArray(v)) return v.map(String)
  return [String(v)]
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function asNumber(v: unknown): number | undefined {
  const s = asString(v)
  if (s === undefined) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

// --- VLAN (vif) sub-interfaces -------------------------------------------

/** Parses the `vif <vlan-id> { ... }` children of an Ethernet,
 * Bonding, or Bridge interface - the shape is identical regardless of
 * parent type. */
function parseVlans(parentRaw: unknown): InterfaceVlan[] {
  const vifRoot = child(parentRaw, 'vif')
  if (!isRecord(vifRoot)) return []

  return Object.entries(vifRoot)
    .map(
      ([vlanId, raw]) =>
        ({
          vlanId,
          description: asString(child(raw, 'description')),
          disabled: isFlagPresent(raw, 'disable'),
          mac: asString(child(raw, 'mac')),
          mtu: asNumber(child(raw, 'mtu')),
          addresses: asArray(child(raw, 'address')),
          vrf: asString(child(raw, 'vrf')),
        }) satisfies InterfaceVlan,
    )
    .sort((a, b) => Number(a.vlanId) - Number(b.vlanId))
}

/** Builds the path to a VLAN sub-interface (or a field under it) given
 * its parent interface's own path. */
export function vlanPath(parentPath: string[], vlanId: string, ...rest: string[]): string[] {
  return [...parentPath, 'vif', vlanId, ...rest]
}

// --- Ethernet --------------------------------------------------------------

export function ethernetPath(name: string, ...rest: string[]): string[] {
  return ['interfaces', 'ethernet', name, ...rest]
}

/** Parses every configured Ethernet interface. Unlike Bonding/Bridge,
 * this only reflects interfaces that already have *some* config node
 * present - cross-reference against the live/operational interface
 * list (useInterfaces) to also show physical interfaces that exist but
 * have no configuration at all yet. */
export function parseEthernetInterfaces(interfaces: unknown): EthernetInterface[] {
  const root = child(interfaces, 'ethernet')
  if (!isRecord(root)) return []

  return Object.entries(root)
    .map(
      ([name, raw]) =>
        ({
          name,
          description: asString(child(raw, 'description')),
          disabled: isFlagPresent(raw, 'disable'),
          mac: asString(child(raw, 'mac')),
          mtu: asNumber(child(raw, 'mtu')),
          addresses: asArray(child(raw, 'address')),
          vrf: asString(child(raw, 'vrf')),
          vlans: parseVlans(raw),
        }) satisfies EthernetInterface,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- Bonding -----------------------------------------------------------------

export function bondPath(name: string, ...rest: string[]): string[] {
  return ['interfaces', 'bonding', name, ...rest]
}

export function parseBondInterfaces(interfaces: unknown): BondInterface[] {
  const root = child(interfaces, 'bonding')
  if (!isRecord(root)) return []

  return Object.entries(root)
    .map(([name, raw]) => {
      const modeRaw = asString(child(raw, 'mode'))
      const mode = (BOND_MODES as readonly string[]).includes(modeRaw ?? '')
        ? (modeRaw as BondMode)
        : '802.3ad' // VyOS's own default when unset

      const hashPolicyRaw = asString(child(raw, 'hash-policy'))
      const hashPolicy = (BOND_HASH_POLICIES as readonly string[]).includes(hashPolicyRaw ?? '')
        ? (hashPolicyRaw as BondHashPolicy)
        : undefined

      const lacpRateRaw = asString(child(raw, 'lacp-rate'))
      const lacpRate = (BOND_LACP_RATES as readonly string[]).includes(lacpRateRaw ?? '')
        ? (lacpRateRaw as BondLacpRate)
        : undefined

      return {
        name,
        description: asString(child(raw, 'description')),
        disabled: isFlagPresent(raw, 'disable'),
        mac: asString(child(raw, 'mac')),
        mtu: asNumber(child(raw, 'mtu')),
        addresses: asArray(child(raw, 'address')),
        vrf: asString(child(raw, 'vrf')),
        mode,
        hashPolicy,
        primary: asString(child(raw, 'primary')),
        lacpRate,
        minLinks: asNumber(child(raw, 'min-links')),
        members: asArray(child(child(raw, 'member'), 'interface')),
        vlans: parseVlans(raw),
      } satisfies BondInterface
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- Bridge ------------------------------------------------------------------

export function bridgePath(name: string, ...rest: string[]): string[] {
  return ['interfaces', 'bridge', name, ...rest]
}

function parseBridgeMembers(raw: unknown): BridgeMember[] {
  // Unlike bonding, bridge members are a tag node (each member name
  // can carry its own priority/cost), not a plain multi-valued leaf.
  const memberRoot = child(child(raw, 'member'), 'interface')
  if (!isRecord(memberRoot)) return []
  return Object.entries(memberRoot)
    .map(
      ([name, memberRaw]) =>
        ({
          name,
          priority: asNumber(child(memberRaw, 'priority')),
          cost: asNumber(child(memberRaw, 'cost')),
        }) satisfies BridgeMember,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function parseBridgeInterfaces(interfaces: unknown): BridgeInterface[] {
  const root = child(interfaces, 'bridge')
  if (!isRecord(root)) return []

  return Object.entries(root)
    .map(([name, raw]) => {
      const protocolRaw = asString(child(raw, 'protocol'))
      const vlanProtocol = (BRIDGE_VLAN_PROTOCOLS as readonly string[]).includes(
        protocolRaw ?? '',
      )
        ? (protocolRaw as BridgeVlanProtocol)
        : undefined

      return {
        name,
        description: asString(child(raw, 'description')),
        disabled: isFlagPresent(raw, 'disable'),
        mac: asString(child(raw, 'mac')),
        mtu: asNumber(child(raw, 'mtu')),
        addresses: asArray(child(raw, 'address')),
        vrf: asString(child(raw, 'vrf')),
        stp: isFlagPresent(raw, 'stp'),
        vlanAware: isFlagPresent(raw, 'enable-vlan'),
        vlanProtocol,
        members: parseBridgeMembers(raw),
        vlans: parseVlans(raw),
      } satisfies BridgeInterface
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- VRF -----------------------------------------------------------------------

export function vrfPath(name: string, ...rest: string[]): string[] {
  return ['vrf', 'name', name, ...rest]
}

export function parseVrfs(vrf: unknown): Vrf[] {
  const root = child(vrf, 'name')
  if (!isRecord(root)) return []

  return Object.entries(root)
    .map(([name, raw]) => ({ name, table: asString(child(raw, 'table')) ?? '' }) satisfies Vrf)
    .sort((a, b) => a.name.localeCompare(b.name))
}
