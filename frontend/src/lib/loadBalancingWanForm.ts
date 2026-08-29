import { wanHealthTestPath, wanInterfaceHealthPath, wanPath, wanRuleInterfacePath, wanRulePath } from './loadBalancingParse'
import type { WANInterfaceHealth, WANMatch, WANRule } from './loadBalancingTypes'
import type { ConfigOp } from './vyosApi'

// --- global WAN toggles ---------------------------------------------------

function wanFlagOp(segment: string, enabled: boolean): ConfigOp {
  const path = wanPath(segment)
  return enabled ? { op: 'set', path } : { op: 'delete', path }
}

export const toggleDisableSourceNatOp = (v: boolean) => wanFlagOp('disable-source-nat', v)
export const toggleEnableLocalTrafficOp = (v: boolean) => wanFlagOp('enable-local-traffic', v)
export const toggleFlushConnectionsOp = (v: boolean) => wanFlagOp('flush-connections', v)
export const toggleOnlyDefaultRouteOp = (v: boolean) => wanFlagOp('only-default-route', v)

export function toggleStickyInboundOp(enabled: boolean): ConfigOp {
  const path = wanPath('sticky-connections', 'inbound')
  return enabled ? { op: 'set', path } : { op: 'delete', path }
}

export function setWANHookOp(value: string): ConfigOp {
  const path = wanPath('hook')
  return value.trim() === '' ? { op: 'delete', path } : { op: 'set', path, value: value.trim() }
}

// --- interface-health ------------------------------------------------------

export interface InterfaceHealthFormValues {
  nexthop: string
  failureCount: string
  successCount: string
}

export function blankInterfaceHealthFormValues(): InterfaceHealthFormValues {
  return { nexthop: '', failureCount: '', successCount: '' }
}

export function interfaceHealthToFormValues(health: WANInterfaceHealth): InterfaceHealthFormValues {
  return {
    nexthop: health.nexthop ?? '',
    failureCount: String(health.failureCount),
    successCount: String(health.successCount),
  }
}

/** Builds the ops for creating or editing an `interface-health
 * <ifname>` entry (not its nested `test <id>` list - see
 * addWANHealthTestOps/removeWANHealthTestOp for that, following the
 * same "nested list gets its own add/remove helpers" convention as
 * vpnIpsecForm.ts's tunnels). */
export function interfaceHealthFormToOps(
  ifname: string,
  before: WANInterfaceHealth | undefined,
  values: InterfaceHealthFormValues,
): ConfigOp[] {
  const base = wanInterfaceHealthPath(ifname)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })

  const beforeValues = before ? interfaceHealthToFormValues(before) : blankInterfaceHealthFormValues()
  const scalarFields: { get: (v: InterfaceHealthFormValues) => string; segment: string }[] = [
    { get: (v) => v.nexthop, segment: 'nexthop' },
    { get: (v) => v.failureCount, segment: 'failure-count' },
    { get: (v) => v.successCount, segment: 'success-count' },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, field.segment]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function removeInterfaceHealthOp(ifname: string): ConfigOp {
  return { op: 'delete', path: wanInterfaceHealthPath(ifname) }
}

export function addWANHealthTestOps(
  ifname: string,
  testId: string,
  options: { type: string; target: string; testScript: string; respTime: string; ttlLimit: string },
): ConfigOp[] {
  const base = wanHealthTestPath(ifname, testId)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.type) ops.push({ op: 'set', path: [...base, 'type'], value: options.type })
  if (options.target) ops.push({ op: 'set', path: [...base, 'target'], value: options.target })
  if (options.testScript) ops.push({ op: 'set', path: [...base, 'test-script'], value: options.testScript })
  if (options.respTime) ops.push({ op: 'set', path: [...base, 'resp-time'], value: options.respTime })
  if (options.ttlLimit) ops.push({ op: 'set', path: [...base, 'ttl-limit'], value: options.ttlLimit })
  return ops
}

export function removeWANHealthTestOp(ifname: string, testId: string): ConfigOp {
  return { op: 'delete', path: wanHealthTestPath(ifname, testId) }
}

// --- rules -------------------------------------------------------------

export interface WANRuleFormValues {
  description: string
  source: WANMatch
  destination: WANMatch
  exclude: boolean
  failover: boolean
  inboundInterface: string
  perPacketBalancing: boolean
  protocol: string
  limitRate: string
  limitPeriod: string
  limitBurst: string
  limitThreshold: string
}

export function blankWANRuleFormValues(): WANRuleFormValues {
  return {
    description: '',
    source: {},
    destination: {},
    exclude: false,
    failover: false,
    inboundInterface: '',
    perPacketBalancing: false,
    protocol: 'all',
    limitRate: '',
    limitPeriod: 'second',
    limitBurst: '',
    limitThreshold: 'below',
  }
}

export function wanRuleToFormValues(rule: WANRule): WANRuleFormValues {
  return {
    description: rule.description ?? '',
    source: rule.source,
    destination: rule.destination,
    exclude: rule.exclude,
    failover: rule.failover,
    inboundInterface: rule.inboundInterface ?? '',
    perPacketBalancing: rule.perPacketBalancing,
    protocol: rule.protocol,
    limitRate: rule.limit ? String(rule.limit.rate) : '',
    limitPeriod: rule.limit?.period ?? 'second',
    limitBurst: rule.limit ? String(rule.limit.burst) : '',
    limitThreshold: rule.limit?.threshold ?? 'below',
  }
}

const MATCH_FIELDS: { get: (m: WANMatch) => string | undefined; segments: string[] }[] = [
  { get: (m) => m.address, segments: ['address'] },
  { get: (m) => m.port, segments: ['port'] },
  { get: (m) => m.addressGroup, segments: ['group', 'address-group'] },
  { get: (m) => m.networkGroup, segments: ['group', 'network-group'] },
  { get: (m) => m.portGroup, segments: ['group', 'port-group'] },
  { get: (m) => m.domainGroup, segments: ['group', 'domain-group'] },
]

/** Builds the ops for creating or editing a `rule <N>` (not its nested
 * `interface <name>` list - see addWANRuleInterfaceOps/
 * removeWANRuleInterfaceOp). */
export function wanRuleFormToOps(
  ruleId: string,
  before: WANRule | undefined,
  values: WANRuleFormValues,
): ConfigOp[] {
  const base = wanRulePath(ruleId)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })

  const beforeValues = before ? wanRuleToFormValues(before) : blankWANRuleFormValues()

  const flagFields: { get: (v: WANRuleFormValues) => boolean; segments: string[] }[] = [
    { get: (v) => v.exclude, segments: ['exclude'] },
    { get: (v) => v.failover, segments: ['failover'] },
    { get: (v) => v.perPacketBalancing, segments: ['per-packet-balancing'] },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: WANRuleFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.description, segments: ['description'] },
    { get: (v) => v.inboundInterface, segments: ['inbound-interface'] },
    { get: (v) => v.protocol, segments: ['protocol'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  for (const side of ['source', 'destination'] as const) {
    for (const field of MATCH_FIELDS) {
      const oldValue = field.get(beforeValues[side]) ?? ''
      const newValue = field.get(values[side]) ?? ''
      if (oldValue === newValue) continue
      const path = [...base, side, ...field.segments]
      if (newValue.trim() === '') ops.push({ op: 'delete', path })
      else ops.push({ op: 'set', path, value: newValue.trim() })
    }
  }

  // `limit` is a single sub-node in the XML, so it's diffed as one
  // unit (present-or-not) rather than field-by-field - if any of the
  // limit inputs changed, replace the whole node. This mirrors how
  // WAN rules materialize `limit` server-side only when the user
  // actually configured something under it (VyOS prunes it back out
  // otherwise - see docs/architecture.md's "Load-balancing" section).
  const limitFields: [string, string][] = [
    ['rate', values.limitRate.trim()],
    ['period', values.limitPeriod],
    ['burst', values.limitBurst.trim()],
    ['threshold', values.limitThreshold],
  ]
  const hasLimit = values.limitRate.trim() !== '' || values.limitBurst.trim() !== ''
  const hadLimit = before?.limit !== undefined
  const limitChanged =
    beforeValues.limitRate !== values.limitRate ||
    beforeValues.limitPeriod !== values.limitPeriod ||
    beforeValues.limitBurst !== values.limitBurst ||
    beforeValues.limitThreshold !== values.limitThreshold
  if (hasLimit !== hadLimit || limitChanged) {
    const limitPath = [...base, 'limit']
    if (!hasLimit) {
      if (hadLimit) ops.push({ op: 'delete', path: limitPath })
    } else {
      ops.push({ op: 'set', path: limitPath })
      for (const [segment, value] of limitFields) {
        if (value !== '') ops.push({ op: 'set', path: [...limitPath, segment], value })
      }
    }
  }

  return ops
}

export function deleteWANRuleOp(ruleId: string): ConfigOp {
  return { op: 'delete', path: wanRulePath(ruleId) }
}

export function addWANRuleInterfaceOps(ruleId: string, ifaceName: string, weight: string): ConfigOp[] {
  const base = wanRuleInterfacePath(ruleId, ifaceName)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (weight.trim() !== '') ops.push({ op: 'set', path: [...base, 'weight'], value: weight.trim() })
  return ops
}

export function removeWANRuleInterfaceOp(ruleId: string, ifaceName: string): ConfigOp {
  return { op: 'delete', path: wanRuleInterfacePath(ruleId, ifaceName) }
}
