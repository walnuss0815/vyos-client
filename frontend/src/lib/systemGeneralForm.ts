import { staticHostMappingPath, systemPath } from './systemParse'
import type { SystemGeneralSettings } from './systemTypes'
import type { ConfigOp } from './vyosApi'

export interface SystemGeneralFormValues {
  hostName: string
  domainName: string
  timeZone: string
}

// Deliberately excludes domainSearch/nameServers (multi-valued leaves,
// managed directly via the generic ChipList component in the UI, same
// as StaticRouteCard.tsx's dhcp-interface list) and static host
// mappings (managed via the add/remove functions below - a separate,
// simple keyed list, not part of this diffed form).

export function blankGeneralFormValues(): SystemGeneralFormValues {
  return { hostName: '', domainName: '', timeZone: '' }
}

export function generalToFormValues(settings: SystemGeneralSettings): SystemGeneralFormValues {
  return {
    hostName: settings.hostName ?? '',
    domainName: settings.domainName ?? '',
    timeZone: settings.timeZone ?? '',
  }
}

interface ScalarField {
  get: (v: SystemGeneralFormValues) => string
  segment: string
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.hostName, segment: 'host-name' },
  { get: (v) => v.domainName, segment: 'domain-name' },
  { get: (v) => v.timeZone, segment: 'time-zone' },
]

export function generalFormToOps(
  before: SystemGeneralSettings,
  values: SystemGeneralFormValues,
): ConfigOp[] {
  const beforeValues = generalToFormValues(before)
  const ops: ConfigOp[] = []

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = systemPath(field.segment)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

/** Creating a static host mapping with zero addresses isn't useful -
 * same reasoning static routes' CreateRouteForm already established
 * for requiring an initial "via". `address` is required; `alias` is
 * optional (a mapping can have addresses with no alias). */
export function addStaticHostMappingOps(
  hostName: string,
  address: string,
  alias: string,
): ConfigOp[] {
  const base = staticHostMappingPath(hostName)
  const ops: ConfigOp[] = [{ op: 'set', path: [...base, 'inet'], value: address }]
  const trimmedAlias = alias.trim()
  if (trimmedAlias) {
    ops.push({ op: 'set', path: [...base, 'alias'], value: trimmedAlias })
  }
  return ops
}

export function deleteStaticHostMappingOp(hostName: string): ConfigOp {
  return { op: 'delete', path: staticHostMappingPath(hostName) }
}
