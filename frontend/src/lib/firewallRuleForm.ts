import type { ConfigOp } from './vyosApi'
import { rulePath, type RulesetRef } from './firewallParse'
import type { FirewallMatch, FirewallRule, RuleAction } from './firewallTypes'

/**
 * Editable form state for a firewall rule. Mirrors FirewallRule but
 * with every optional field normalized to '' instead of undefined, so
 * controlled <input>/<select> elements always have a defined value.
 */
export interface MatchFormValues {
  address: string
  port: string
  macAddress: string
  addressGroup: string
  networkGroup: string
  portGroup: string
  macGroup: string
  domainGroup: string
}

export interface RuleFormValues {
  action: RuleAction | ''
  jumpTarget: string
  protocol: string
  description: string
  disabled: boolean
  log: boolean
  source: MatchFormValues
  destination: MatchFormValues
  inboundInterface: string
  outboundInterface: string
  icmpTypeName: string
}

function blankMatch(): MatchFormValues {
  return {
    address: '',
    port: '',
    macAddress: '',
    addressGroup: '',
    networkGroup: '',
    portGroup: '',
    macGroup: '',
    domainGroup: '',
  }
}

export function blankRuleFormValues(): RuleFormValues {
  return {
    action: '',
    jumpTarget: '',
    protocol: '',
    description: '',
    disabled: false,
    log: false,
    source: blankMatch(),
    destination: blankMatch(),
    inboundInterface: '',
    outboundInterface: '',
    icmpTypeName: '',
  }
}

function matchToFormValues(match: FirewallMatch): MatchFormValues {
  return {
    address: match.address ?? '',
    port: match.port ?? '',
    macAddress: match.macAddress ?? '',
    addressGroup: match.addressGroup ?? '',
    networkGroup: match.networkGroup ?? '',
    portGroup: match.portGroup ?? '',
    macGroup: match.macGroup ?? '',
    domainGroup: match.domainGroup ?? '',
  }
}

export function ruleToFormValues(rule: FirewallRule): RuleFormValues {
  return {
    action: rule.action ?? '',
    jumpTarget: rule.jumpTarget ?? '',
    protocol: rule.protocol ?? '',
    description: rule.description ?? '',
    disabled: rule.disabled,
    log: rule.log,
    source: matchToFormValues(rule.source),
    destination: matchToFormValues(rule.destination),
    inboundInterface: rule.inboundInterface ?? '',
    outboundInterface: rule.outboundInterface ?? '',
    icmpTypeName: rule.icmpTypeName ?? '',
  }
}

interface ScalarField {
  get: (v: RuleFormValues) => string
  /** Static segments, or a function of the target ruleset's family for
   * the one field (ICMP type name) whose config-tree node name differs
   * between ipv4 (`icmp`) and ipv6 (`icmpv6`) - see
   * firewallParse.ts's icmpNodeName. */
  segments: string[] | ((family: RulesetRef['family']) => string[])
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.action, segments: ['action'] },
  { get: (v) => v.jumpTarget, segments: ['jump-target'] },
  { get: (v) => v.protocol, segments: ['protocol'] },
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.source.address, segments: ['source', 'address'] },
  { get: (v) => v.source.port, segments: ['source', 'port'] },
  { get: (v) => v.source.macAddress, segments: ['source', 'mac-address'] },
  { get: (v) => v.source.addressGroup, segments: ['source', 'group', 'address-group'] },
  { get: (v) => v.source.networkGroup, segments: ['source', 'group', 'network-group'] },
  { get: (v) => v.source.portGroup, segments: ['source', 'group', 'port-group'] },
  { get: (v) => v.source.macGroup, segments: ['source', 'group', 'mac-group'] },
  { get: (v) => v.source.domainGroup, segments: ['source', 'group', 'domain-group'] },
  { get: (v) => v.destination.address, segments: ['destination', 'address'] },
  { get: (v) => v.destination.port, segments: ['destination', 'port'] },
  { get: (v) => v.destination.addressGroup, segments: ['destination', 'group', 'address-group'] },
  { get: (v) => v.destination.networkGroup, segments: ['destination', 'group', 'network-group'] },
  { get: (v) => v.destination.portGroup, segments: ['destination', 'group', 'port-group'] },
  { get: (v) => v.destination.macGroup, segments: ['destination', 'group', 'mac-group'] },
  { get: (v) => v.destination.domainGroup, segments: ['destination', 'group', 'domain-group'] },
  { get: (v) => v.inboundInterface, segments: ['inbound-interface', 'name'] },
  { get: (v) => v.outboundInterface, segments: ['outbound-interface', 'name'] },
  {
    get: (v) => v.icmpTypeName,
    segments: (family) => [family === 'ipv6' ? 'icmpv6' : 'icmp', 'type-name'],
  },
]

interface FlagField {
  get: (v: RuleFormValues) => boolean
  segments: string[]
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.disabled, segments: ['disable'] },
  { get: (v) => v.log, segments: ['log'] },
]

/**
 * Diffs `before` (the rule as last fetched from VyOS, or undefined
 * when creating a new rule) against `values` (the current form state)
 * and returns only the ConfigOps needed to make VyOS match the form -
 * not a full rewrite of every field. Queuing only the diff keeps the
 * pending-changes review readable and avoids clobbering fields the
 * user didn't touch with redundant (if harmless) `set` calls.
 */
export function ruleFormToOps(
  ref: RulesetRef,
  ruleNumber: string,
  before: FirewallRule | undefined,
  values: RuleFormValues,
): ConfigOp[] {
  const beforeValues = before ? ruleToFormValues(before) : blankRuleFormValues()
  const ops: ConfigOp[] = []

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const segments = typeof field.segments === 'function' ? field.segments(ref.family) : field.segments
    const path = rulePath(ref, ruleNumber, ...segments)
    if (newValue.trim() === '') {
      ops.push({ op: 'delete', path })
    } else {
      ops.push({ op: 'set', path, value: newValue.trim() })
    }
  }

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = rulePath(ref, ruleNumber, ...field.segments)
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  return ops
}

// --- drag-and-drop rule reordering -----------------------------------

/** VyOS orders rule evaluation strictly by ascending numeric value of
 * the `rule <N>` tag - there is no "move" primitive in its REST API,
 * so reordering is always a delete-and-recreate of every rule whose
 * number needs to change. To keep that blast radius as small as
 * possible (both for the pending-changes review and for what a human
 * expects "drag rule A above rule B" to actually touch), this first
 * tries to find a free integer strictly between the moved rule's new
 * neighbors and only renumbers that one rule; only when no such gap
 * exists (e.g. neighbors are consecutive integers like 10 and 11) does
 * it fall back to renumbering every rule in the ruleset to a clean,
 * evenly-spaced sequence matching the new order. */
function idealNumberBetween(prev: number | undefined, next: number | undefined): number | undefined {
  if (prev === undefined && next === undefined) return undefined
  if (prev === undefined) {
    // Moving to the very front: needs an integer in [1, next).
    if (next === undefined || next <= 1) return undefined
    return Math.floor(next / 2)
  }
  if (next === undefined) {
    // Moving to the very back: always room above the last rule.
    return prev + 10
  }
  if (next - prev <= 1) return undefined
  return prev + Math.floor((next - prev) / 2)
}

/** Removes the element at fromIndex and reinserts it at toIndex
 * (evaluated against the array with that element already removed -
 * the conventional "array move" semantics), without mutating arr. */
function moveItem<T>(arr: readonly T[], fromIndex: number, toIndex: number): T[] {
  const copy = arr.slice()
  const [item] = copy.splice(fromIndex, 1)
  copy.splice(toIndex, 0, item)
  return copy
}

/** Computes the ConfigOps to move the rule at `fromIndex` (in
 * `rules`, expected to already be in ascending-number display order)
 * to `toIndex`. Returns [] for a no-op move (same index, or an
 * out-of-bounds index). Deletes for every renumbered rule are always
 * emitted before any of the corresponding sets, regardless of how
 * many rules are affected - a full-renumber fallback could otherwise
 * have rule A's new number collide with rule B's not-yet-deleted old
 * content if sets and deletes were interleaved per-rule instead. */
export function reorderRuleOps(
  ref: RulesetRef,
  rules: readonly FirewallRule[],
  fromIndex: number,
  toIndex: number,
): ConfigOp[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= rules.length ||
    toIndex < 0 ||
    toIndex >= rules.length
  ) {
    return []
  }

  const reordered = moveItem(rules, fromIndex, toIndex)
  const prevNumber = reordered[toIndex - 1] ? Number(reordered[toIndex - 1].number) : undefined
  const nextNumber = reordered[toIndex + 1] ? Number(reordered[toIndex + 1].number) : undefined
  const idealNumber = idealNumberBetween(prevNumber, nextNumber)

  const changes: { rule: FirewallRule; newNumber: string }[] =
    idealNumber !== undefined
      ? [{ rule: reordered[toIndex], newNumber: String(idealNumber) }]
      : reordered
          .map((rule, i) => ({ rule, newNumber: String((i + 1) * 10) }))
          .filter(({ rule, newNumber }) => rule.number !== newNumber)

  const ops: ConfigOp[] = []
  for (const { rule } of changes) {
    ops.push({ op: 'delete', path: rulePath(ref, rule.number) })
  }
  for (const { rule, newNumber } of changes) {
    ops.push(...ruleFormToOps(ref, newNumber, undefined, ruleToFormValues(rule)))
  }
  return ops
}
