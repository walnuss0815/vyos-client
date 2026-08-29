import { lldpInterfaceCoordinatePath, lldpInterfaceElinPath, lldpInterfacePath, lldpPath } from './serviceLldpParse'
import type { LLDPInterface } from './serviceLldpTypes'
import type { ConfigOp } from './vyosApi'

export interface LLDPInterfaceFormValues {
  mode: string
  altitude: string
  datum: string
  latitude: string
  longitude: string
  elin: string
}

export function blankLLDPInterfaceFormValues(): LLDPInterfaceFormValues {
  return { mode: '', altitude: '', datum: '', latitude: '', longitude: '', elin: '' }
}

export function lldpInterfaceToFormValues(iface: LLDPInterface): LLDPInterfaceFormValues {
  return {
    mode: iface.mode ?? '',
    altitude: iface.location.altitude ?? '',
    datum: iface.location.datum ?? '',
    latitude: iface.location.latitude ?? '',
    longitude: iface.location.longitude ?? '',
    elin: iface.location.elin ?? '',
  }
}

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. `before === undefined`
 * always includes a bare `set` for the interface tag itself, same
 * convention as containerNestedForm.ts's addNetworkAttachmentOps. */
export function lldpInterfaceFormToOps(
  interfaceName: string,
  before: LLDPInterface | undefined,
  values: LLDPInterfaceFormValues,
): ConfigOp[] {
  const beforeValues = before ? lldpInterfaceToFormValues(before) : blankLLDPInterfaceFormValues()
  const ops: ConfigOp[] = []
  const base = lldpInterfacePath(interfaceName)

  if (before === undefined) ops.push({ op: 'set', path: base })

  if (beforeValues.mode !== values.mode) {
    const path = [...base, 'mode']
    if (values.mode.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.mode.trim() })
  }

  const coordinateFields: { get: (v: LLDPInterfaceFormValues) => string; segment: string }[] = [
    { get: (v) => v.altitude, segment: 'altitude' },
    { get: (v) => v.datum, segment: 'datum' },
    { get: (v) => v.latitude, segment: 'latitude' },
    { get: (v) => v.longitude, segment: 'longitude' },
  ]
  for (const field of coordinateFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = lldpInterfaceCoordinatePath(interfaceName, field.segment)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  if (beforeValues.elin !== values.elin) {
    const path = lldpInterfaceElinPath(interfaceName)
    if (values.elin.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.elin.trim() })
  }

  return ops
}

export function deleteLLDPInterfaceOp(interfaceName: string): ConfigOp {
  return { op: 'delete', path: lldpInterfacePath(interfaceName) }
}

export interface LLDPGeneralFormValues {
  legacyCdp: boolean
  legacyEdp: boolean
  legacyFdp: boolean
  legacySonmp: boolean
  snmp: boolean
}

export function blankLLDPGeneralFormValues(): LLDPGeneralFormValues {
  return { legacyCdp: false, legacyEdp: false, legacyFdp: false, legacySonmp: false, snmp: false }
}

export function lldpConfigToGeneralFormValues(config: {
  legacyCdp: boolean
  legacyEdp: boolean
  legacyFdp: boolean
  legacySonmp: boolean
  snmp: boolean
}): LLDPGeneralFormValues {
  return {
    legacyCdp: config.legacyCdp,
    legacyEdp: config.legacyEdp,
    legacyFdp: config.legacyFdp,
    legacySonmp: config.legacySonmp,
    snmp: config.snmp,
  }
}

export function lldpGeneralFormToOps(
  before: LLDPGeneralFormValues,
  values: LLDPGeneralFormValues,
): ConfigOp[] {
  const ops: ConfigOp[] = []
  const fields: { get: (v: LLDPGeneralFormValues) => boolean; path: string[] }[] = [
    { get: (v) => v.legacyCdp, path: lldpPath('legacy-protocols', 'cdp') },
    { get: (v) => v.legacyEdp, path: lldpPath('legacy-protocols', 'edp') },
    { get: (v) => v.legacyFdp, path: lldpPath('legacy-protocols', 'fdp') },
    { get: (v) => v.legacySonmp, path: lldpPath('legacy-protocols', 'sonmp') },
    { get: (v) => v.snmp, path: lldpPath('snmp') },
  ]
  for (const field of fields) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    ops.push(newValue ? { op: 'set', path: field.path } : { op: 'delete', path: field.path })
  }
  return ops
}

export function enableLLDPOp(): ConfigOp {
  return { op: 'set', path: lldpPath() }
}

export function disableLLDPOp(): ConfigOp {
  return { op: 'delete', path: lldpPath() }
}
