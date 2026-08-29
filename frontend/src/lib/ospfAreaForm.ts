import { ospfAreaPath } from './ospfParse'
import type { OSPFArea, OSPFAreaType, OSPFProtocol } from './ospfTypes'
import type { ConfigOp } from './vyosApi'

export interface OSPFAreaFormValues {
  areaType: '' | OSPFAreaType
  noSummary: boolean
  defaultCost: string
  /** OSPFv2 nssa only. */
  nssaTranslate: '' | 'always' | 'candidate' | 'never'
  /** OSPFv3 nssa only. */
  nssaDefaultInformationOriginate: boolean
  /** OSPFv2 only. */
  authentication: '' | 'plaintext-password' | 'md5'
}

// Deliberately excludes `networks` (an OSPFv2-only multi-valued leaf,
// managed directly via the generic ChipList component in the UI, same
// as StaticRouteCard.tsx's dhcp-interface list) and `ranges` (managed
// via addAreaRangeOps/removeAreaRangeOp below, same simple add/remove
// pattern as BGP's network advertisement list in bgpGlobalForm.ts -
// not a diffable sub-form).

export function blankAreaFormValues(): OSPFAreaFormValues {
  return {
    areaType: '',
    noSummary: false,
    defaultCost: '',
    nssaTranslate: '',
    nssaDefaultInformationOriginate: false,
    authentication: '',
  }
}

export function areaToFormValues(area: OSPFArea): OSPFAreaFormValues {
  return {
    areaType: area.areaType ?? '',
    noSummary: area.noSummary,
    defaultCost: area.defaultCost ?? '',
    nssaTranslate: area.nssaTranslate ?? '',
    nssaDefaultInformationOriginate: area.nssaDefaultInformationOriginate,
    authentication: area.authentication ?? '',
  }
}

/**
 * Diffs `before` (the area as last fetched, or undefined when
 * creating a new area) against `values`. `area-type` is a
 * discriminated union in VyOS's own tree (stub XOR nssa XOR neither,
 * each a differently-shaped subtree) - switching between them (or to/
 * from "normal") clears the whole `area-type` node first rather than
 * trying to diff mismatched fields against each other; staying within
 * the same type diffs its individual fields for minimal ops, same
 * approach as every other diffed form in this codebase (see
 * bgpPeerForm.ts's peerFormToOps).
 */
export function areaFormToOps(
  protocol: OSPFProtocol,
  areaId: string,
  before: OSPFArea | undefined,
  values: OSPFAreaFormValues,
): ConfigOp[] {
  const beforeValues = before ? areaToFormValues(before) : blankAreaFormValues()
  const ops: ConfigOp[] = []
  const base = ospfAreaPath(protocol, areaId)

  if (beforeValues.areaType !== values.areaType) {
    if (beforeValues.areaType !== '') {
      ops.push({ op: 'delete', path: [...base, 'area-type'] })
    }
    if (values.areaType !== '') {
      const typeBase = [...base, 'area-type', values.areaType]
      ops.push({ op: 'set', path: typeBase })
      if (values.noSummary) ops.push({ op: 'set', path: [...typeBase, 'no-summary'] })
      if (values.defaultCost) {
        ops.push({ op: 'set', path: [...typeBase, 'default-cost'], value: values.defaultCost })
      }
      if (values.areaType === 'nssa') {
        if (protocol === 'ospf' && values.nssaTranslate) {
          ops.push({ op: 'set', path: [...typeBase, 'translate'], value: values.nssaTranslate })
        }
        if (protocol === 'ospfv3' && values.nssaDefaultInformationOriginate) {
          ops.push({ op: 'set', path: [...typeBase, 'default-information-originate'] })
        }
      }
    }
  } else if (values.areaType !== '') {
    const typeBase = [...base, 'area-type', values.areaType]

    if (beforeValues.noSummary !== values.noSummary) {
      const path = [...typeBase, 'no-summary']
      ops.push(values.noSummary ? { op: 'set', path } : { op: 'delete', path })
    }

    if (beforeValues.defaultCost !== values.defaultCost) {
      const path = [...typeBase, 'default-cost']
      if (values.defaultCost.trim() === '') ops.push({ op: 'delete', path })
      else ops.push({ op: 'set', path, value: values.defaultCost.trim() })
    }

    if (
      values.areaType === 'nssa' &&
      protocol === 'ospf' &&
      beforeValues.nssaTranslate !== values.nssaTranslate
    ) {
      const path = [...typeBase, 'translate']
      if (values.nssaTranslate.trim() === '') ops.push({ op: 'delete', path })
      else ops.push({ op: 'set', path, value: values.nssaTranslate.trim() })
    }

    if (
      values.areaType === 'nssa' &&
      protocol === 'ospfv3' &&
      beforeValues.nssaDefaultInformationOriginate !== values.nssaDefaultInformationOriginate
    ) {
      const path = [...typeBase, 'default-information-originate']
      ops.push(
        values.nssaDefaultInformationOriginate ? { op: 'set', path } : { op: 'delete', path },
      )
    }
  }

  if (protocol === 'ospf' && beforeValues.authentication !== values.authentication) {
    const path = [...base, 'authentication']
    if (values.authentication.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.authentication.trim() })
  }

  return ops
}

export function deleteAreaOp(protocol: OSPFProtocol, areaId: string): ConfigOp {
  return { op: 'delete', path: ospfAreaPath(protocol, areaId) }
}

export interface AreaRangeOptions {
  notAdvertise?: boolean
  /** OSPFv2 only. */
  cost?: string
  /** OSPFv2 only. */
  substitute?: string
}

export function addAreaRangeOps(
  protocol: OSPFProtocol,
  areaId: string,
  prefix: string,
  options: AreaRangeOptions,
): ConfigOp[] {
  const base = ospfAreaPath(protocol, areaId, 'range', prefix)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.notAdvertise) {
    ops.push({ op: 'set', path: [...base, 'not-advertise'] })
  }
  if (protocol === 'ospf' && options.cost?.trim()) {
    ops.push({ op: 'set', path: [...base, 'cost'], value: options.cost.trim() })
  }
  if (protocol === 'ospf' && options.substitute?.trim()) {
    ops.push({ op: 'set', path: [...base, 'substitute'], value: options.substitute.trim() })
  }
  return ops
}

export function removeAreaRangeOp(protocol: OSPFProtocol, areaId: string, prefix: string): ConfigOp {
  return { op: 'delete', path: ospfAreaPath(protocol, areaId, 'range', prefix) }
}
