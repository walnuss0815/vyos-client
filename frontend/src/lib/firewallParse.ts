import {
  BASE_CHAINS,
  FIREWALL_FAMILIES,
  GROUP_MEMBER_LEAF,
  GROUP_TYPES,
  type BaseChain,
  type FirewallFamily,
  type FirewallGlobalOptions,
  type FirewallGroup,
  type FirewallMatch,
  type FirewallRule,
  type FirewallRuleset,
  type FirewallZone,
  type GroupType,
  type RuleAction,
} from './firewallTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** VyOS represents a single-valued leaf as a bare string and a
 * multi-valued leaf as an array; this normalizes either into an array. */
function asArray(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (Array.isArray(v)) return v.map(String)
  return [String(v)]
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

// --- zones ---------------------------------------------------------------

export function parseZones(firewall: unknown): FirewallZone[] {
  const zoneRoot = child(firewall, 'zone')
  if (!isRecord(zoneRoot)) return []

  return Object.entries(zoneRoot)
    .map(([name, raw]) => {
      const from: Record<string, string> = {}
      const fromRoot = child(raw, 'from')
      if (isRecord(fromRoot)) {
        for (const [srcZone, fromRaw] of Object.entries(fromRoot)) {
          const rulesetName = asString(child(child(fromRaw, 'firewall'), 'name'))
          if (rulesetName) from[srcZone] = rulesetName
        }
      }

      return {
        name,
        description: asString(child(raw, 'description')),
        localZone: isFlagPresent(raw, 'local-zone'),
        interfaces: asArray(child(raw, 'interface')),
        defaultAction: asString(child(raw, 'default-action')),
        defaultLog: isFlagPresent(raw, 'default-log'),
        from,
      } satisfies FirewallZone
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function zonePath(name: string, ...rest: string[]): string[] {
  return ['firewall', 'zone', name, ...rest]
}

// --- groups ----------------------------------------------------------------

export function parseGroups(firewall: unknown): FirewallGroup[] {
  const groupRoot = child(firewall, 'group')
  if (!isRecord(groupRoot)) return []

  const groups: FirewallGroup[] = []
  for (const type of GROUP_TYPES) {
    const typeRoot = child(groupRoot, type)
    if (!isRecord(typeRoot)) continue
    for (const [name, raw] of Object.entries(typeRoot)) {
      groups.push({
        type,
        name,
        description: asString(child(raw, 'description')),
        members: asArray(child(raw, GROUP_MEMBER_LEAF[type])),
      })
    }
  }
  return groups.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
}

export function groupPath(type: GroupType, name: string, ...rest: string[]): string[] {
  return ['firewall', 'group', type, name, ...rest]
}

// --- rulesets / rules ------------------------------------------------------

export interface RulesetRef {
  id: string
  kind: 'base' | 'custom'
  family: FirewallFamily
}

/** Builds the VyOS path prefix for a ruleset (everything up to, but
 * not including, its own fields like default-action or rule/<N>). */
export function rulesetPath(ref: RulesetRef, ...rest: string[]): string[] {
  if (ref.kind === 'base') {
    return ['firewall', ref.family, ref.id, 'filter', ...rest]
  }
  return ['firewall', ref.family, 'name', ref.id, ...rest]
}

export function rulePath(ref: RulesetRef, ruleNumber: string, ...rest: string[]): string[] {
  return rulesetPath(ref, 'rule', ruleNumber, ...rest)
}

const RULE_ACTIONS: readonly RuleAction[] = [
  'accept',
  'continue',
  'drop',
  'jump',
  'queue',
  'reject',
  'return',
  'synproxy',
]

function parseMatch(raw: unknown): FirewallMatch {
  const groupRoot = child(raw, 'group')
  return {
    address: asString(child(raw, 'address')),
    port: asString(child(raw, 'port')),
    macAddress: asString(child(raw, 'mac-address')),
    addressGroup: asString(child(groupRoot, 'address-group')),
    networkGroup: asString(child(groupRoot, 'network-group')),
    portGroup: asString(child(groupRoot, 'port-group')),
    macGroup: asString(child(groupRoot, 'mac-group')),
    domainGroup: asString(child(groupRoot, 'domain-group')),
  }
}

/** VyOS's ICMP-matching node is named differently depending on family
 * - `icmp` under `firewall ipv4 ...`, `icmpv6` under `firewall ipv6
 * ...` - confirmed against VyOS's own docs (see firewallTypes.ts's
 * FirewallFamily doc comment). The only family-specific difference at
 * the rule-match level; every other field (including group-reference
 * leaf names like `address-group`/`port-group`) is identical between
 * the two trees. */
function icmpNodeName(family: FirewallFamily): string {
  return family === 'ipv6' ? 'icmpv6' : 'icmp'
}

function parseRule(family: FirewallFamily, number: string, raw: unknown): FirewallRule {
  const actionRaw = asString(child(raw, 'action'))
  const action = RULE_ACTIONS.find((a) => a === actionRaw)
  return {
    number,
    action,
    jumpTarget: asString(child(raw, 'jump-target')),
    protocol: asString(child(raw, 'protocol')),
    description: asString(child(raw, 'description')),
    disabled: isFlagPresent(raw, 'disable'),
    log: isFlagPresent(raw, 'log'),
    source: parseMatch(child(raw, 'source')),
    destination: parseMatch(child(raw, 'destination')),
    inboundInterface: asString(child(child(raw, 'inbound-interface'), 'name')),
    outboundInterface: asString(child(child(raw, 'outbound-interface'), 'name')),
    icmpTypeName: asString(child(child(raw, icmpNodeName(family)), 'type-name')),
  }
}

function parseRules(family: FirewallFamily, raw: unknown): FirewallRule[] {
  const ruleRoot = child(raw, 'rule')
  if (!isRecord(ruleRoot)) return []
  return Object.entries(ruleRoot)
    .map(([number, r]) => parseRule(family, number, r))
    .sort((a, b) => Number(a.number) - Number(b.number))
}

/** Parses the three base chains (forward/input/output filter) plus
 * every custom chain under `firewall <family> name <...>`, for both
 * ipv4 and ipv6 - genuinely separate rulesets in VyOS's config tree
 * that just happen to mirror each other's shape almost exactly (see
 * FirewallFamily's doc comment for the one exception). The raw
 * prerouting/output-raw chains aren't modeled - see the module doc
 * comment in firewallTypes.ts. */
export function parseRulesets(firewall: unknown): FirewallRuleset[] {
  const rulesets: FirewallRuleset[] = []

  for (const family of FIREWALL_FAMILIES) {
    const familyRoot = child(firewall, family)

    for (const chain of BASE_CHAINS as readonly BaseChain[]) {
      const filterRoot = child(child(familyRoot, chain), 'filter')
      if (!isRecord(filterRoot)) continue
      rulesets.push({
        id: chain,
        kind: 'base',
        family,
        defaultAction: asString(child(filterRoot, 'default-action')),
        rules: parseRules(family, filterRoot),
      })
    }

    const nameRoot = child(familyRoot, 'name')
    if (isRecord(nameRoot)) {
      for (const [name, raw] of Object.entries(nameRoot)) {
        rulesets.push({
          id: name,
          kind: 'custom',
          family,
          defaultAction: asString(child(raw, 'default-action')),
          description: asString(child(raw, 'description')),
          rules: parseRules(family, raw),
        })
      }
    }
  }

  return rulesets
}

// --- global options ----------------------------------------------------------

export function parseGlobalOptions(firewall: unknown): FirewallGlobalOptions {
  const root = child(firewall, 'global-options')
  const stateRoot = child(root, 'state-policy')

  function enableDisable(v: unknown): 'enable' | 'disable' | undefined {
    const s = asString(v)
    return s === 'enable' || s === 'disable' ? s : undefined
  }

  return {
    allPing: enableDisable(child(root, 'all-ping')),
    broadcastPing: enableDisable(child(root, 'broadcast-ping')),
    synCookies: enableDisable(child(root, 'syn-cookies')),
    logMartians: enableDisable(child(root, 'log-martians')),
    ipSrcRoute: enableDisable(child(root, 'ip-src-route')),
    stateInvalidAction: asString(child(child(stateRoot, 'invalid'), 'action')),
    stateEstablishedAction: asString(child(child(stateRoot, 'established'), 'action')),
    stateRelatedAction: asString(child(child(stateRoot, 'related'), 'action')),
  }
}

export function globalOptionsPath(...rest: string[]): string[] {
  return ['firewall', 'global-options', ...rest]
}
