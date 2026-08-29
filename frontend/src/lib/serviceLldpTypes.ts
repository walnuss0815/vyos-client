/**
 * Typed, UI-friendly shape for `service lldp`. Confirmed against
 * vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_lldp.xml.in`). Full coverage -
 * small area.
 *
 * `interface <name>`'s tag accepts either a real interface name or
 * the literal string `"all"` (apply to every interface) - both are
 * valid values for the same tagNode, not a separate discriminator.
 */

export const LLDP_MODES = ['disable', 'rx-tx', 'tx', 'rx'] as const

export const LLDP_DATUMS = ['WGS84', 'NAD83', 'MLLW'] as const

export interface LLDPLocation {
  altitude?: string
  datum?: string
  latitude?: string
  longitude?: string
  /** Emergency Call Service ELIN number (10-25 digits). */
  elin?: string
}

export function blankLLDPLocation(): LLDPLocation {
  return {}
}

export interface LLDPInterface {
  /** A real interface name, or the literal string "all". */
  interfaceName: string
  /** Defaults to 'rx-tx' in VyOS if unset. */
  mode?: string
  location: LLDPLocation
}

export function blankLLDPInterface(): Omit<LLDPInterface, 'interfaceName'> {
  return { location: blankLLDPLocation() }
}

export interface LLDPConfig {
  /** Whether `service lldp` exists at all in the tree. */
  enabled: boolean
  interfaces: LLDPInterface[]
  legacyCdp: boolean
  legacyEdp: boolean
  legacyFdp: boolean
  legacySonmp: boolean
  managementAddresses: string[]
  /** Advertise LLDP-MIB data via SNMP (requires `service snmp`). */
  snmp: boolean
}

export function blankLLDPConfig(): LLDPConfig {
  return {
    enabled: false,
    interfaces: [],
    legacyCdp: false,
    legacyEdp: false,
    legacyFdp: false,
    legacySonmp: false,
    managementAddresses: [],
    snmp: false,
  }
}
