import { blankLLDPConfig, blankLLDPInterface, type LLDPConfig, type LLDPInterface, type LLDPLocation } from './serviceLldpTypes'
import { isRecord, asString, asStringArray, child, isFlagPresent } from './configTree'

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

function parseLocation(raw: unknown): LLDPLocation {
  const locationRoot = child(raw, 'location')
  const coordRoot = child(locationRoot, 'coordinate-based')
  return {
    altitude: asString(child(coordRoot, 'altitude')),
    datum: asString(child(coordRoot, 'datum')),
    latitude: asString(child(coordRoot, 'latitude')),
    longitude: asString(child(coordRoot, 'longitude')),
    elin: asString(child(locationRoot, 'elin')),
  }
}

function parseInterface(interfaceName: string, raw: unknown): LLDPInterface {
  return {
    interfaceName,
    ...blankLLDPInterface(),
    mode: asString(child(raw, 'mode')),
    location: parseLocation(raw),
  }
}

export function parseLLDPConfig(lldp: unknown): LLDPConfig {
  if (lldp === undefined) return blankLLDPConfig()
  const legacy = child(lldp, 'legacy-protocols')
  return {
    enabled: true,
    interfaces: entries(child(lldp, 'interface'))
      .map(([name, raw]) => parseInterface(name, raw))
      .sort((a, b) => a.interfaceName.localeCompare(b.interfaceName)),
    legacyCdp: isFlagPresent(legacy, 'cdp'),
    legacyEdp: isFlagPresent(legacy, 'edp'),
    legacyFdp: isFlagPresent(legacy, 'fdp'),
    legacySonmp: isFlagPresent(legacy, 'sonmp'),
    managementAddresses: asStringArray(child(lldp, 'management-address')),
    snmp: isFlagPresent(lldp, 'snmp'),
  }
}

// --- path builders -----------------------------------------------------

export function lldpPath(...rest: string[]): string[] {
  return ['service', 'lldp', ...rest]
}

export function lldpInterfacePath(interfaceName: string, ...rest: string[]): string[] {
  return lldpPath('interface', interfaceName, ...rest)
}

export function lldpInterfaceCoordinatePath(interfaceName: string, ...rest: string[]): string[] {
  return lldpInterfacePath(interfaceName, 'location', 'coordinate-based', ...rest)
}

export function lldpInterfaceElinPath(interfaceName: string): string[] {
  return lldpInterfacePath(interfaceName, 'location', 'elin')
}
