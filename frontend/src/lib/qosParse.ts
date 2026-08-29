import type {
  QosCakePolicy,
  QosClassPolice,
  QosConfig,
  QosFqCodelPolicy,
  QosHfscClass,
  QosHfscCurve,
  QosHfscDefaultClass,
  QosInterfaceBinding,
  QosLimiterClass,
  QosLimiterDefaultClass,
  QosLimiterPolicy,
  QosMatch,
  QosMatchGroup,
  QosPriorityQueuePolicy,
  QosRateControlPolicy,
  QosRoundRobinPolicy,
  QosShaperClass,
  QosShaperDefaultClass,
  QosShaperHfscPolicy,
  QosShaperPolicy,
  QosSimpleClassfulClass,
  QosSimpleClassfulDefaultClass,
} from './qosTypes'

// --- generic VyOS JSON-tree helpers (mirrors this app's other parse
// files' own copies) ---------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asArray(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (Array.isArray(v)) return v.map(String)
  return [String(v)]
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function numberOrUndefined(v: unknown): number | undefined {
  const s = asString(v)
  if (s === undefined) return undefined
  const n = Number(s)
  // Number.isFinite, not just !Number.isNaN: Number("Infinity") and
  // Number("-Infinity") are both legitimate finite-looking JS numeric
  // conversions of a non-numeric string, which isNaN alone lets
  // through as a "valid" value for a field like priority/cost/
  // bandwidth that should never actually be infinite.
  return Number.isFinite(n) ? n : undefined
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

// --- path helpers ----------------------------------------------------

export function qosPath(...rest: string[]): string[] {
  return ['qos', ...rest]
}

export function qosInterfacePath(ifname: string, ...rest: string[]): string[] {
  return [...qosPath('interface'), ifname, ...rest]
}

export function qosPolicyPath(type: string, name: string, ...rest: string[]): string[] {
  return [...qosPath('policy'), type, name, ...rest]
}

export function qosClassPath(type: string, policyName: string, classId: string, ...rest: string[]): string[] {
  return [...qosPolicyPath(type, policyName), 'class', classId, ...rest]
}

export function qosDefaultClassPath(type: string, policyName: string, ...rest: string[]): string[] {
  return [...qosPolicyPath(type, policyName), 'default', ...rest]
}

export function qosMatchGroupPath(name: string, ...rest: string[]): string[] {
  return [...qosPath('traffic-match-group'), name, ...rest]
}

export function qosMatchGroupMatchPath(groupName: string, matchId: string, ...rest: string[]): string[] {
  return [...qosMatchGroupPath(groupName), 'match', matchId, ...rest]
}

// --- shared: match rules -----------------------------------------------

function parseQosMatch(id: string, raw: unknown): QosMatch {
  const ip = child(raw, 'ip')
  const ipv6 = child(raw, 'ipv6')
  const ether = child(raw, 'ether')
  const ipSource = child(ip, 'source')
  const ipDest = child(ip, 'destination')
  const ipv6Source = child(ipv6, 'source')
  const ipv6Dest = child(ipv6, 'destination')
  return {
    id,
    description: asString(child(raw, 'description')),
    interface: asString(child(raw, 'interface')),
    ipSourceAddress: asString(child(ipSource, 'address')),
    ipSourcePort: asString(child(ipSource, 'port')),
    ipDestinationAddress: asString(child(ipDest, 'address')),
    ipDestinationPort: asString(child(ipDest, 'port')),
    ipProtocol: asString(child(ip, 'protocol')),
    ipDscp: asString(child(ip, 'dscp')),
    ipMaxLength: numberOrUndefined(child(ip, 'max-length')),
    ipTcpAck: isFlagPresent(child(ip, 'tcp'), 'ack'),
    ipTcpSyn: isFlagPresent(child(ip, 'tcp'), 'syn'),
    ipv6SourceAddress: asString(child(ipv6Source, 'address')),
    ipv6SourcePort: asString(child(ipv6Source, 'port')),
    ipv6DestinationAddress: asString(child(ipv6Dest, 'address')),
    ipv6DestinationPort: asString(child(ipv6Dest, 'port')),
    ipv6Protocol: asString(child(ipv6, 'protocol')),
    ipv6Dscp: asString(child(ipv6, 'dscp')),
    ipv6MaxLength: numberOrUndefined(child(ipv6, 'max-length')),
    ipv6TcpAck: isFlagPresent(child(ipv6, 'tcp'), 'ack'),
    ipv6TcpSyn: isFlagPresent(child(ipv6, 'tcp'), 'syn'),
    etherSource: asString(child(ether, 'source')),
    etherDestination: asString(child(ether, 'destination')),
    etherProtocol: asString(child(ether, 'protocol')),
    mark: numberOrUndefined(child(raw, 'mark')),
    vif: numberOrUndefined(child(raw, 'vif')),
  }
}

function parseQosMatches(raw: unknown): QosMatch[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([id, v]) => parseQosMatch(id, v))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function parseMatchGroup(name: string, raw: unknown): QosMatchGroup {
  return {
    name,
    description: asString(child(raw, 'description')),
    matches: parseQosMatches(child(raw, 'match')),
  }
}

function parseMatchGroups(raw: unknown): QosMatchGroup[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([name, v]) => parseMatchGroup(name, v))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- interface bindings ------------------------------------------------

function parseInterfaceBindings(raw: unknown): QosInterfaceBinding[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([ifname, v]) => ({
      interface: ifname,
      ingress: asString(child(v, 'ingress')),
      egress: asString(child(v, 'egress')),
    }))
    .sort((a, b) => a.interface.localeCompare(b.interface))
}

// --- limiter -----------------------------------------------------------

function parseClassPolice(raw: unknown): QosClassPolice {
  return {
    exceed: asString(child(raw, 'exceed')) ?? 'drop',
    notExceed: asString(child(raw, 'not-exceed')) ?? 'ok',
  }
}

function parseLimiterClass(id: string, raw: unknown): QosLimiterClass {
  return {
    id,
    description: asString(child(raw, 'description')),
    bandwidth: asString(child(raw, 'bandwidth')),
    burst: asString(child(raw, 'burst')) ?? '15k',
    mtu: numberOrUndefined(child(raw, 'mtu')),
    police: parseClassPolice(raw),
    matches: parseQosMatches(child(raw, 'match')),
    matchGroups: asArray(child(raw, 'match-group')),
    priority: numberOrUndefined(child(raw, 'priority')) ?? 20,
  }
}

function parseLimiterDefaultClass(raw: unknown): QosLimiterDefaultClass {
  return {
    bandwidth: asString(child(raw, 'bandwidth')),
    burst: asString(child(raw, 'burst')) ?? '15k',
    mtu: numberOrUndefined(child(raw, 'mtu')),
    police: parseClassPolice(raw),
  }
}

function parseLimiterPolicies(raw: unknown): QosLimiterPolicy[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([name, v]) => {
      const classRoot = child(v, 'class')
      const classes = isRecord(classRoot)
        ? Object.entries(classRoot)
            .map(([id, c]) => parseLimiterClass(id, c))
            .sort((a, b) => Number(a.id) - Number(b.id))
        : []
      return {
        name,
        description: asString(child(v, 'description')),
        classes,
        defaultClass: parseLimiterDefaultClass(child(v, 'default')),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- shaper --------------------------------------------------------------

function parseShaperClass(id: string, raw: unknown): QosShaperClass {
  return {
    id,
    description: asString(child(raw, 'description')),
    bandwidth: asString(child(raw, 'bandwidth')),
    burst: asString(child(raw, 'burst')) ?? '15k',
    ceiling: asString(child(raw, 'ceiling')),
    codelQuantum: numberOrUndefined(child(raw, 'codel-quantum')),
    flows: numberOrUndefined(child(raw, 'flows')),
    interval: numberOrUndefined(child(raw, 'interval')),
    matches: parseQosMatches(child(raw, 'match')),
    matchGroups: asArray(child(raw, 'match-group')),
    priority: numberOrUndefined(child(raw, 'priority')),
    queueAveragePacket: numberOrUndefined(child(raw, 'queue-average-packet')),
    queueMaximumThreshold: numberOrUndefined(child(raw, 'queue-maximum-threshold')),
    queueMinimumThreshold: numberOrUndefined(child(raw, 'queue-minimum-threshold')),
    queueMarkProbability: numberOrUndefined(child(raw, 'queue-mark-probability')),
    queueLimit: numberOrUndefined(child(raw, 'queue-limit')),
    queueType: asString(child(raw, 'queue-type')) ?? 'fq-codel',
    setDscp: asString(child(raw, 'set-dscp')),
    target: numberOrUndefined(child(raw, 'target')),
  }
}

function parseShaperDefaultClass(raw: unknown): QosShaperDefaultClass {
  return {
    bandwidth: asString(child(raw, 'bandwidth')),
    burst: asString(child(raw, 'burst')) ?? '15k',
    ceiling: asString(child(raw, 'ceiling')),
    codelQuantum: numberOrUndefined(child(raw, 'codel-quantum')),
    flows: numberOrUndefined(child(raw, 'flows')),
    interval: numberOrUndefined(child(raw, 'interval')),
    priority: numberOrUndefined(child(raw, 'priority')) ?? 20,
    queueAveragePacket: numberOrUndefined(child(raw, 'queue-average-packet')),
    queueMaximumThreshold: numberOrUndefined(child(raw, 'queue-maximum-threshold')),
    queueMinimumThreshold: numberOrUndefined(child(raw, 'queue-minimum-threshold')),
    queueMarkProbability: numberOrUndefined(child(raw, 'queue-mark-probability')),
    queueLimit: numberOrUndefined(child(raw, 'queue-limit')),
    queueType: asString(child(raw, 'queue-type')) ?? 'fq-codel',
    setDscp: asString(child(raw, 'set-dscp')),
    target: numberOrUndefined(child(raw, 'target')),
  }
}

function parseShaperPolicies(raw: unknown): QosShaperPolicy[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([name, v]) => {
      const classRoot = child(v, 'class')
      const classes = isRecord(classRoot)
        ? Object.entries(classRoot)
            .map(([id, c]) => parseShaperClass(id, c))
            .sort((a, b) => Number(a.id) - Number(b.id))
        : []
      return {
        name,
        description: asString(child(v, 'description')),
        bandwidth: asString(child(v, 'bandwidth')) ?? 'auto',
        classes,
        defaultClass: parseShaperDefaultClass(child(v, 'default')),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- shaper-hfsc ---------------------------------------------------------

function parseHfscCurve(raw: unknown): QosHfscCurve {
  return {
    d: numberOrUndefined(child(raw, 'd')),
    m1: asString(child(raw, 'm1')),
    m2: asString(child(raw, 'm2')),
  }
}

function parseHfscClass(id: string, raw: unknown): QosHfscClass {
  return {
    id,
    description: asString(child(raw, 'description')),
    linkshare: parseHfscCurve(child(raw, 'linkshare')),
    realtime: parseHfscCurve(child(raw, 'realtime')),
    upperlimit: parseHfscCurve(child(raw, 'upperlimit')),
    matches: parseQosMatches(child(raw, 'match')),
    matchGroups: asArray(child(raw, 'match-group')),
  }
}

function parseHfscDefaultClass(raw: unknown): QosHfscDefaultClass {
  return {
    linkshare: parseHfscCurve(child(raw, 'linkshare')),
    realtime: parseHfscCurve(child(raw, 'realtime')),
    upperlimit: parseHfscCurve(child(raw, 'upperlimit')),
  }
}

function parseShaperHfscPolicies(raw: unknown): QosShaperHfscPolicy[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([name, v]) => {
      const classRoot = child(v, 'class')
      const classes = isRecord(classRoot)
        ? Object.entries(classRoot)
            .map(([id, c]) => parseHfscClass(id, c))
            .sort((a, b) => Number(a.id) - Number(b.id))
        : []
      return {
        name,
        description: asString(child(v, 'description')),
        bandwidth: asString(child(v, 'bandwidth')) ?? 'auto',
        classes,
        defaultClass: parseHfscDefaultClass(child(v, 'default')),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- priority-queue / round-robin ---------------------------------------

function parseSimpleClassfulClass(id: string, raw: unknown): QosSimpleClassfulClass {
  return {
    id,
    description: asString(child(raw, 'description')),
    codelQuantum: numberOrUndefined(child(raw, 'codel-quantum')),
    flows: numberOrUndefined(child(raw, 'flows')),
    interval: numberOrUndefined(child(raw, 'interval')),
    quantum: numberOrUndefined(child(raw, 'quantum')),
    matches: parseQosMatches(child(raw, 'match')),
    matchGroups: asArray(child(raw, 'match-group')),
    queueLimit: numberOrUndefined(child(raw, 'queue-limit')),
    queueType: asString(child(raw, 'queue-type')) ?? 'drop-tail',
    target: numberOrUndefined(child(raw, 'target')),
  }
}

function parseSimpleClassfulDefaultClass(raw: unknown, fallbackQueueType: string): QosSimpleClassfulDefaultClass {
  return {
    codelQuantum: numberOrUndefined(child(raw, 'codel-quantum')),
    flows: numberOrUndefined(child(raw, 'flows')),
    interval: numberOrUndefined(child(raw, 'interval')),
    queueLimit: numberOrUndefined(child(raw, 'queue-limit')),
    queueType: asString(child(raw, 'queue-type')) ?? fallbackQueueType,
    target: numberOrUndefined(child(raw, 'target')),
  }
}

function parsePriorityQueuePolicies(raw: unknown): QosPriorityQueuePolicy[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([name, v]) => {
      const classRoot = child(v, 'class')
      const classes = isRecord(classRoot)
        ? Object.entries(classRoot)
            .map(([id, c]) => parseSimpleClassfulClass(id, c))
            .sort((a, b) => Number(a.id) - Number(b.id))
        : []
      return {
        name,
        description: asString(child(v, 'description')),
        classes,
        defaultClass: parseSimpleClassfulDefaultClass(child(v, 'default'), 'drop-tail'),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function parseRoundRobinPolicies(raw: unknown): QosRoundRobinPolicy[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([name, v]) => {
      const classRoot = child(v, 'class')
      const classes = isRecord(classRoot)
        ? Object.entries(classRoot)
            .map(([id, c]) => parseSimpleClassfulClass(id, c))
            .sort((a, b) => Number(a.id) - Number(b.id))
        : []
      return {
        name,
        description: asString(child(v, 'description')),
        classes,
        // round-robin's own default class defaults to 'fair-queue',
        // not 'drop-tail' - VyOS's own asymmetric default (confirmed
        // against qos.xml.in).
        defaultClass: parseSimpleClassfulDefaultClass(child(v, 'default'), 'fair-queue'),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- cake / fq-codel / rate-control (non-classful) ------------------------

function parseCakePolicies(raw: unknown): QosCakePolicy[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([name, v]) => ({
      name,
      description: asString(child(v, 'description')),
      bandwidth: asString(child(v, 'bandwidth')),
      flowIsolation: asString(child(v, 'flow-isolation')) ?? 'triple-isolate',
      flowIsolationNat: isFlagPresent(v, 'flow-isolation-nat'),
      noSplitGso: isFlagPresent(v, 'no-split-gso'),
      ackFilterAggressive: isFlagPresent(child(v, 'ack-filter'), 'aggressive'),
      rtt: numberOrUndefined(child(v, 'rtt')) ?? 100,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function parseFqCodelPolicies(raw: unknown): QosFqCodelPolicy[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([name, v]) => ({
      name,
      description: asString(child(v, 'description')),
      codelQuantum: numberOrUndefined(child(v, 'codel-quantum')),
      flows: numberOrUndefined(child(v, 'flows')),
      interval: numberOrUndefined(child(v, 'interval')),
      queueLimit: numberOrUndefined(child(v, 'queue-limit')),
      target: numberOrUndefined(child(v, 'target')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function parseRateControlPolicies(raw: unknown): QosRateControlPolicy[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([name, v]) => ({
      name,
      description: asString(child(v, 'description')),
      bandwidth: asString(child(v, 'bandwidth')),
      burst: asString(child(v, 'burst')) ?? '15k',
      latency: numberOrUndefined(child(v, 'latency')) ?? 50,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- top-level -------------------------------------------------------

export function parseQosConfig(qos: unknown): QosConfig {
  const policy = child(qos, 'policy')
  return {
    interfaces: parseInterfaceBindings(child(qos, 'interface')),
    matchGroups: parseMatchGroups(child(qos, 'traffic-match-group')),
    shaperPolicies: parseShaperPolicies(child(policy, 'shaper')),
    shaperHfscPolicies: parseShaperHfscPolicies(child(policy, 'shaper-hfsc')),
    limiterPolicies: parseLimiterPolicies(child(policy, 'limiter')),
    priorityQueuePolicies: parsePriorityQueuePolicies(child(policy, 'priority-queue')),
    roundRobinPolicies: parseRoundRobinPolicies(child(policy, 'round-robin')),
    cakePolicies: parseCakePolicies(child(policy, 'cake')),
    fqCodelPolicies: parseFqCodelPolicies(child(policy, 'fq-codel')),
    rateControlPolicies: parseRateControlPolicies(child(policy, 'rate-control')),
  }
}
