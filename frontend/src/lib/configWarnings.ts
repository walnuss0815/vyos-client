import { evaluateConfigWarningRules, type ConfigWarning } from './configWarningRules'
import type { FirewallRuleset } from './firewallTypes'
import type { HTTPSConfig } from './serviceHttpsTypes'
import type { SNMPConfig } from './serviceSnmpTypes'
import type { SSHConfig } from './serviceSshTypes'
import type { SystemUser } from './systemTypes'

export type { ConfigWarning }

/**
 * The "configuration warnings" banner (components/ConfigWarningsBanner
 * .tsx) is now data-driven: the actual rules (message + a JMESPath
 * condition) live in configWarningRules.json, validated against
 * configWarningRules.schema.json and evaluated by
 * configWarningRules.ts's evaluateConfigWarningRules. This module's
 * only remaining job is bridging already-typed config
 * (useFirewallConfig/useServiceConfig/useSystemConfig's own output -
 * see hooks/useConfigWarnings.ts) into the plain "facts" object those
 * rules query against.
 *
 * Rule scope was deliberately narrowed from an earlier broader
 * wishlist after checking each item against VyOS's own docs/schema -
 * this hasn't changed just because the rules moved to data:
 * - SSH root login: dropped entirely - VyOS 1.2+ removed SSH root
 *   login outright (confirmed in docs.vyos.io's SSH page), there is no
 *   config toggle for it, so nothing to warn about.
 * - Telnet enabled: dropped entirely - VyOS has no telnet service at
 *   all (confirmed absent from docs.vyos.io's Service index and this
 *   repo has zero telnet-related code anywhere).
 * - "Weak" secrets (e.g. password is literally "admin"): not
 *   checkable from the frontend at all - every secret this app models
 *   is write-only (a `hasX` boolean, see SystemUser.hasPassword's doc
 *   comment), the real value is never sent back. Only "empty" (no
 *   secret configured where one plainly should be) is checkable - see
 *   configWarningRules.json's user-no-auth rule.
 */
export interface ConfigWarningInputs {
  rulesets: FirewallRuleset[]
  ssh: SSHConfig
  https: HTTPSConfig
  snmp: SNMPConfig
  users: SystemUser[]
}

/**
 * Builds the plain "facts" object configWarningRules.json's JMESPath
 * queries run against. Two things happen here that wouldn't be
 * necessary with hand-written TS logic:
 *
 * - A JSON round-trip (`JSON.parse(JSON.stringify(...))`) normalizes
 *   the data into pure JSON semantics: JMESPath's own type system (and
 *   jmespath.js's evaluator) has no concept of JS's `undefined` - an
 *   optional TS field left unset becomes a JMESPath `null` after this
 *   round-trip, matching how the rules compare against it (e.g.
 *   `defaultAction==null`). This also incidentally deep-clones the
 *   input, so a rule's query can never mutate state a hook still
 *   holds a reference to.
 * - `snmp.communities` gets a precomputed `nameLower` field per
 *   community, since JMESPath has no built-in case-insensitive
 *   comparison or lower-case function - see configWarningRules.json's
 *   own doc comment on the weak-community rule for why this
 *   normalization has to happen in TS rather than in the rule itself.
 */
export function buildConfigWarningFacts(inputs: ConfigWarningInputs): Record<string, unknown> {
  const raw = {
    rulesets: inputs.rulesets,
    ssh: inputs.ssh,
    https: inputs.https,
    snmp: {
      ...inputs.snmp,
      communities: inputs.snmp.communities.map((c) => ({ ...c, nameLower: c.name.toLowerCase() })),
    },
    users: inputs.users,
  }
  return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
}

/** Runs every data-driven rule (configWarningRules.json) against
 * already-parsed config. See hooks/useConfigWarnings.ts for how the
 * three underlying config areas are fetched and combined into
 * `inputs`, and components/ConfigWarningsBanner.tsx for the banner
 * that surfaces the result. */
export function evaluateConfigWarnings(inputs: ConfigWarningInputs): ConfigWarning[] {
  return evaluateConfigWarningRules(buildConfigWarningFacts(inputs))
}
