/**
 * Typed, UI-friendly shapes for VyOS's `qos` config tree (Traffic
 * Policy / QoS - the config-tree root was renamed from `traffic-policy`
 * to `qos` in 2022; confirmed against vyos-1x's
 * interface-definitions/qos.xml.in, the current schema). VyOS has 12
 * sibling policy types under `qos policy`; per an explicit product
 * scoping decision this app covers 8 of them - the two classful
 * bandwidth-shaping workhorses (`shaper`/`shaper-hfsc`), the only
 * ingress-capable type (`limiter`), the two modern "just works"
 * qdiscs (`cake`/`fq-codel`), and `priority-queue`/`round-robin`/
 * `rate-control`. Not modeled (still fully editable via Config Tree):
 * `drop-tail`, `fair-queue`, `random-detect`, `network-emulator` (a
 * link-impairment testing tool, not a real QoS mechanism) - see
 * docs/roadmap.md's "Not yet built" note.
 *
 * See qosParse.ts for the raw VyOS JSON -> these shapes conversion,
 * and qosMatchForm.ts/qosPolicyForms.ts/qosInterfaceForm.ts for the
 * reverse (form values -> ConfigOp path arrays).
 */

// --- shared: class/match-group match rules --------------------------

/** One `match <name>` rule, shared by every classful policy type
 * (`shaper`, `shaper-hfsc`, `limiter`, `priority-queue`, `round-robin`)
 * and standalone `qos traffic-match-group`. A class-level match also
 * supports `ether`/`interface` matching, which a match-group's own
 * match does not (confirmed against the XML - traffic-match-group's
 * `match` only includes ip/ipv6/mark/vif) - both contexts share this
 * one type regardless, since the difference is just which fields a
 * given context populates/exposes.
 *
 * Only a practical subset (address/port for source+destination,
 * protocol, DSCP, fwmark, VLAN tag, ingress interface) is exposed in
 * this app's own "add a match" form - `ether`/TCP-flags/max-length
 * matching is still parsed (so existing values display and round-trip
 * correctly) but not offered when creating a *new* match rule; see
 * docs/roadmap.md's "Not yet built" note. */
export interface QosMatch {
  id: string
  description?: string
  interface?: string
  ipSourceAddress?: string
  ipSourcePort?: string
  ipDestinationAddress?: string
  ipDestinationPort?: string
  ipProtocol?: string
  ipDscp?: string
  ipMaxLength?: number
  ipTcpAck: boolean
  ipTcpSyn: boolean
  ipv6SourceAddress?: string
  ipv6SourcePort?: string
  ipv6DestinationAddress?: string
  ipv6DestinationPort?: string
  ipv6Protocol?: string
  ipv6Dscp?: string
  ipv6MaxLength?: number
  ipv6TcpAck: boolean
  ipv6TcpSyn: boolean
  etherSource?: string
  etherDestination?: string
  etherProtocol?: string
  mark?: number
  vif?: number
}

export interface QosMatchGroup {
  name: string
  description?: string
  matches: QosMatch[]
}

// --- interface bindings ----------------------------------------------

/** `qos interface <ifname> { ingress <policy>, egress <policy> }` -
 * VyOS enforces (at commit time) that `ingress` can only reference a
 * `limiter` policy and `egress` can only reference one of the other 7
 * modeled types (plus the 4 unmodeled ones) - this app's own picker
 * filters accordingly rather than waiting for a commit error. */
export interface QosInterfaceBinding {
  interface: string
  ingress?: string
  egress?: string
}

// --- limiter -----------------------------------------------------------

export interface QosClassPolice {
  /** Default 'drop' - action for packets exceeding the limiter. */
  exceed: string
  /** Default 'ok' - action for packets within the limit. */
  notExceed: string
}

export interface QosLimiterClass {
  id: string
  description?: string
  bandwidth?: string
  /** Default '15k'. */
  burst: string
  mtu?: number
  police: QosClassPolice
  matches: QosMatch[]
  matchGroups: string[]
  /** Match-rule evaluation order, 0-20. Default 20. */
  priority: number
}

export interface QosLimiterDefaultClass {
  bandwidth?: string
  burst: string
  mtu?: number
  police: QosClassPolice
}

export interface QosLimiterPolicy {
  name: string
  description?: string
  classes: QosLimiterClass[]
  defaultClass: QosLimiterDefaultClass
}

// --- shaper (HTB) --------------------------------------------------------

export interface QosShaperClass {
  id: string
  description?: string
  /** Guaranteed rate - number+unit, a %, or (class-level only) 'auto'. */
  bandwidth?: string
  burst: string
  /** Max burstable rate - defaults to bandwidth if unset. */
  ceiling?: string
  codelQuantum?: number
  flows?: number
  interval?: number
  matches: QosMatch[]
  matchGroups: string[]
  /** Match-rule evaluation order, 0-20. */
  priority?: number
  queueAveragePacket?: number
  queueMaximumThreshold?: number
  queueMinimumThreshold?: number
  queueMarkProbability?: number
  queueLimit?: number
  /** Default 'fq-codel'. */
  queueType: string
  setDscp?: string
  target?: number
}

export interface QosShaperDefaultClass {
  bandwidth?: string
  burst: string
  ceiling?: string
  codelQuantum?: number
  flows?: number
  interval?: number
  /** Priority for excess-bandwidth allocation, nominally 0-7 (the
   * XML's own default value of 20 for this field is likely a
   * copy-paste bug from the match-priority field elsewhere - see
   * docs/architecture.md's "Traffic Policy / QoS" section - kept
   * as-is rather than silently corrected). */
  priority: number
  queueAveragePacket?: number
  queueMaximumThreshold?: number
  queueMinimumThreshold?: number
  queueMarkProbability?: number
  queueLimit?: number
  queueType: string
  setDscp?: string
  target?: number
}

export interface QosShaperPolicy {
  name: string
  description?: string
  /** Number+unit, a %, or 'auto' (matches interface speed). Default 'auto'. */
  bandwidth: string
  classes: QosShaperClass[]
  defaultClass: QosShaperDefaultClass
}

// --- shaper-hfsc ---------------------------------------------------------

/** One HFSC service curve (linkshare/realtime/upperlimit all share
 * this shape) - `m1`/`d`/`m2` describe a two-slope curve (rate m1
 * until time d, then rate m2), used instead of a flat bandwidth
 * number. */
export interface QosHfscCurve {
  /** Delay in ms, 0-65535. */
  d?: number
  m1?: string
  m2?: string
}

export interface QosHfscClass {
  id: string
  description?: string
  linkshare: QosHfscCurve
  realtime: QosHfscCurve
  upperlimit: QosHfscCurve
  matches: QosMatch[]
  matchGroups: string[]
}

export interface QosHfscDefaultClass {
  linkshare: QosHfscCurve
  realtime: QosHfscCurve
  upperlimit: QosHfscCurve
}

export interface QosShaperHfscPolicy {
  name: string
  description?: string
  bandwidth: string
  classes: QosHfscClass[]
  defaultClass: QosHfscDefaultClass
}

// --- priority-queue / round-robin (simple classful types) ---------------

/** Shared shape for `priority-queue` and `round-robin` classes - both
 * are classful but far simpler than shaper/shaper-hfsc (no bandwidth/
 * ceiling, just an inner qdisc selection). `quantum` is round-robin
 * only (DRR's own scheduling parameter) - left unset/ignored for
 * priority-queue. */
export interface QosSimpleClassfulClass {
  id: string
  description?: string
  codelQuantum?: number
  flows?: number
  interval?: number
  quantum?: number
  matches: QosMatch[]
  matchGroups: string[]
  queueLimit?: number
  /** Default 'drop-tail' for priority-queue class/default and
   * round-robin class; round-robin's own default class defaults to
   * 'fair-queue' instead (VyOS's own asymmetric default, kept as-is). */
  queueType: string
  target?: number
}

export interface QosSimpleClassfulDefaultClass {
  codelQuantum?: number
  flows?: number
  interval?: number
  queueLimit?: number
  queueType: string
  target?: number
}

/** `priority-queue` class IDs double as the priority level (1-7). */
export interface QosPriorityQueuePolicy {
  name: string
  description?: string
  classes: QosSimpleClassfulClass[]
  defaultClass: QosSimpleClassfulDefaultClass
}

export interface QosRoundRobinPolicy {
  name: string
  description?: string
  classes: QosSimpleClassfulClass[]
  defaultClass: QosSimpleClassfulDefaultClass
}

// --- cake ------------------------------------------------------------

export const QOS_CAKE_FLOW_ISOLATION_MODES = [
  'blind', 'src-host', 'dst-host', 'host', 'flow', 'dual-src-host', 'dual-dst-host', 'triple-isolate',
] as const

export interface QosCakePolicy {
  name: string
  description?: string
  bandwidth?: string
  /** Default 'triple-isolate'. */
  flowIsolation: string
  flowIsolationNat: boolean
  noSplitGso: boolean
  ackFilterAggressive: boolean
  /** Round-trip time in ms for AQM tuning. Default 100. */
  rtt: number
}

// --- fq-codel ----------------------------------------------------------

export interface QosFqCodelPolicy {
  name: string
  description?: string
  codelQuantum?: number
  flows?: number
  interval?: number
  queueLimit?: number
  target?: number
}

// --- rate-control (TBF) --------------------------------------------------

export interface QosRateControlPolicy {
  name: string
  description?: string
  bandwidth?: string
  burst: string
  /** Maximum latency in ms. Default 50. */
  latency: number
}

// --- top-level -------------------------------------------------------

export interface QosConfig {
  interfaces: QosInterfaceBinding[]
  matchGroups: QosMatchGroup[]
  shaperPolicies: QosShaperPolicy[]
  shaperHfscPolicies: QosShaperHfscPolicy[]
  limiterPolicies: QosLimiterPolicy[]
  priorityQueuePolicies: QosPriorityQueuePolicy[]
  roundRobinPolicies: QosRoundRobinPolicy[]
  cakePolicies: QosCakePolicy[]
  fqCodelPolicies: QosFqCodelPolicy[]
  rateControlPolicies: QosRateControlPolicy[]
}
