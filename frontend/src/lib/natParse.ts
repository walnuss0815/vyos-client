import type { NATConfig, NATMatch, NATRule, NATRuleKind, NATStaticRule } from './natTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/ospfParse.ts's/
// systemParse.ts's own copy of this comment for why this matches the
// rest of the codebase.)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

// --- rule matching (shared by source/destination NAT and, within a
// rule, by the rule's own source/destination match blocks) -------------

function parseMatch(raw: unknown): NATMatch {
  const groupRoot = child(raw, 'group')
  return {
    address: asString(child(raw, 'address')),
    port: asString(child(raw, 'port')),
    addressGroup: asString(child(groupRoot, 'address-group')),
    networkGroup: asString(child(groupRoot, 'network-group')),
    portGroup: asString(child(groupRoot, 'port-group')),
  }
}

function interfaceSegment(kind: NATRuleKind): 'outbound-interface' | 'inbound-interface' {
  return kind === 'source' ? 'outbound-interface' : 'inbound-interface'
}

function parseRule(kind: NATRuleKind, number: string, raw: unknown): NATRule {
  const translationRoot = child(raw, 'translation')
  return {
    kind,
    number,
    description: asString(child(raw, 'description')),
    interfaceName: asString(child(child(raw, interfaceSegment(kind)), 'name')),
    protocol: asString(child(raw, 'protocol')),
    source: parseMatch(child(raw, 'source')),
    destination: parseMatch(child(raw, 'destination')),
    translationAddress: asString(child(translationRoot, 'address')),
    translationPort: asString(child(translationRoot, 'port')),
    redirectPort:
      kind === 'destination' ? asString(child(child(translationRoot, 'redirect'), 'port')) : undefined,
    disabled: isFlagPresent(raw, 'disable'),
    exclude: isFlagPresent(raw, 'exclude'),
    log: isFlagPresent(raw, 'log'),
  }
}

function parseRules(kind: NATRuleKind, root: unknown): NATRule[] {
  const ruleRoot = child(root, 'rule')
  if (!isRecord(ruleRoot)) return []
  return Object.entries(ruleRoot)
    .map(([number, raw]) => parseRule(kind, number, raw))
    .sort((a, b) => Number(a.number) - Number(b.number))
}

// --- static (1-to-1) rules -----------------------------------------------

function parseStaticRule(number: string, raw: unknown): NATStaticRule {
  return {
    number,
    description: asString(child(raw, 'description')),
    destinationAddress: asString(child(child(raw, 'destination'), 'address')),
    interfaceName: asString(child(raw, 'inbound-interface')),
    translationAddress: asString(child(child(raw, 'translation'), 'address')),
    log: isFlagPresent(raw, 'log'),
  }
}

function parseStaticRules(nat: unknown): NATStaticRule[] {
  const ruleRoot = child(child(nat, 'static'), 'rule')
  if (!isRecord(ruleRoot)) return []
  return Object.entries(ruleRoot)
    .map(([number, raw]) => parseStaticRule(number, raw))
    .sort((a, b) => Number(a.number) - Number(b.number))
}

// --- top level -------------------------------------------------------------

export function parseNATConfig(nat: unknown): NATConfig {
  return {
    sourceRules: parseRules('source', child(nat, 'source')),
    destinationRules: parseRules('destination', child(nat, 'destination')),
    staticRules: parseStaticRules(nat),
  }
}

// --- path builders -----------------------------------------------------

export function natRulePath(kind: NATRuleKind, number: string, ...rest: string[]): string[] {
  return ['nat', kind, 'rule', number, ...rest]
}

export function natRuleInterfacePath(kind: NATRuleKind, number: string, ...rest: string[]): string[] {
  return natRulePath(kind, number, interfaceSegment(kind), ...rest)
}

export function natStaticRulePath(number: string, ...rest: string[]): string[] {
  return ['nat', 'static', 'rule', number, ...rest]
}
