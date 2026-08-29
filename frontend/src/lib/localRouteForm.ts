import { localRouteRulePath } from './policyParse'
import type { LocalRouteFamily, LocalRouteRule } from './policyTypes'
import type { ConfigOp } from './vyosApi'

// Deliberately excludes sourceAddresses/destinationAddresses (multi-
// valued leaves, managed directly via the generic ChipList component
// in the UI, same as StaticRouteCard.tsx's dhcp-interface list).

export interface LocalRouteFormValues {
  protocol: string
  fwmark: string
  sourcePort: string
  destinationPort: string
  inboundInterface: string
  table: string
  vrf: string
}

export function blankLocalRouteFormValues(): LocalRouteFormValues {
  return {
    protocol: '',
    fwmark: '',
    sourcePort: '',
    destinationPort: '',
    inboundInterface: '',
    table: '',
    vrf: '',
  }
}

export function localRouteToFormValues(rule: LocalRouteRule): LocalRouteFormValues {
  return {
    protocol: rule.protocol ?? '',
    fwmark: rule.fwmark ?? '',
    sourcePort: rule.sourcePort ?? '',
    destinationPort: rule.destinationPort ?? '',
    inboundInterface: rule.inboundInterface ?? '',
    table: rule.table ?? '',
    vrf: rule.vrf ?? '',
  }
}

interface ScalarField {
  get: (v: LocalRouteFormValues) => string
  segments: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.protocol, segments: ['protocol'] },
  { get: (v) => v.fwmark, segments: ['fwmark'] },
  { get: (v) => v.sourcePort, segments: ['source', 'port'] },
  { get: (v) => v.destinationPort, segments: ['destination', 'port'] },
  { get: (v) => v.inboundInterface, segments: ['inbound-interface'] },
  { get: (v) => v.table, segments: ['set', 'table'] },
  { get: (v) => v.vrf, segments: ['set', 'vrf'] },
]

export function localRouteFormToOps(
  family: LocalRouteFamily,
  ruleNumber: string,
  before: LocalRouteRule | undefined,
  values: LocalRouteFormValues,
): ConfigOp[] {
  const beforeValues = before ? localRouteToFormValues(before) : blankLocalRouteFormValues()
  const ops: ConfigOp[] = []
  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = localRouteRulePath(family, ruleNumber, ...field.segments)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function deleteLocalRouteOp(family: LocalRouteFamily, ruleNumber: string): ConfigOp {
  return { op: 'delete', path: localRouteRulePath(family, ruleNumber) }
}
