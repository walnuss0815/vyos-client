import { describe, expect, it } from 'vitest'
import { buildConfigWarningFacts, evaluateConfigWarnings, type ConfigWarningInputs } from './configWarnings'
import type { FirewallRuleset } from './firewallTypes'
import { blankHTTPSConfig } from './serviceHttpsTypes'
import { blankSNMPConfig } from './serviceSnmpTypes'
import { blankSSHConfig } from './serviceSshTypes'
import type { SystemUser } from './systemTypes'

function ruleset(overrides: Partial<FirewallRuleset> = {}): FirewallRuleset {
  return { id: 'input', kind: 'base', family: 'ipv4', rules: [], ...overrides }
}

function user(overrides: Partial<SystemUser> = {}): SystemUser {
  return { username: 'alice', disabled: false, hasPassword: false, publicKeys: [], ...overrides }
}

function inputs(overrides: Partial<ConfigWarningInputs> = {}): ConfigWarningInputs {
  return {
    rulesets: [],
    ssh: blankSSHConfig(),
    https: blankHTTPSConfig(),
    snmp: blankSNMPConfig(),
    users: [],
    ...overrides,
  }
}

describe('evaluateConfigWarnings: firewall default-accept rule', () => {
  it('flags an input base chain with no default-action set (accept is the VyOS default)', () => {
    const warnings = evaluateConfigWarnings(inputs({ rulesets: [ruleset({ id: 'input' })] }))
    expect(warnings).toHaveLength(1)
    expect(warnings[0].id).toBe('firewall-default-accept-ipv4-input')
  })

  it('flags a forward base chain explicitly set to accept', () => {
    const warnings = evaluateConfigWarnings(
      inputs({ rulesets: [ruleset({ id: 'forward', defaultAction: 'accept' })] }),
    )
    expect(warnings).toHaveLength(1)
  })

  it('does not flag a base chain explicitly set to drop', () => {
    expect(evaluateConfigWarnings(inputs({ rulesets: [ruleset({ id: 'input', defaultAction: 'drop' })] }))).toEqual(
      [],
    )
  })

  it('does not flag the output base chain', () => {
    expect(evaluateConfigWarnings(inputs({ rulesets: [ruleset({ id: 'output' })] }))).toEqual([])
  })

  it('does not flag a custom chain', () => {
    expect(evaluateConfigWarnings(inputs({ rulesets: [ruleset({ id: 'MY-CHAIN', kind: 'custom' })] }))).toEqual([])
  })

  it('flags ipv4 and ipv6 input independently', () => {
    const warnings = evaluateConfigWarnings(
      inputs({
        rulesets: [ruleset({ id: 'input', family: 'ipv4' }), ruleset({ id: 'input', family: 'ipv6' })],
      }),
    )
    expect(warnings.map((w) => w.id)).toEqual([
      'firewall-default-accept-ipv4-input',
      'firewall-default-accept-ipv6-input',
    ])
  })
})

describe('evaluateConfigWarnings: SSH password auth rule', () => {
  it('flags password auth allowed when SSH is enabled', () => {
    expect(evaluateConfigWarnings(inputs({ ssh: { ...blankSSHConfig(), enabled: true } }))).toHaveLength(1)
  })

  it('does not flag when disable-password-authentication is set', () => {
    expect(
      evaluateConfigWarnings(
        inputs({ ssh: { ...blankSSHConfig(), enabled: true, disablePasswordAuthentication: true } }),
      ),
    ).toEqual([])
  })

  it('does not flag when SSH is not enabled at all', () => {
    expect(evaluateConfigWarnings(inputs({ ssh: blankSSHConfig() }))).toEqual([])
  })
})

describe('evaluateConfigWarnings: HTTPS API restriction rule', () => {
  it('flags an enabled HTTPS API with no allow-client addresses', () => {
    expect(evaluateConfigWarnings(inputs({ https: { ...blankHTTPSConfig(), enabled: true } }))).toHaveLength(1)
  })

  it('does not flag when at least one allow-client address is set', () => {
    expect(
      evaluateConfigWarnings(
        inputs({ https: { ...blankHTTPSConfig(), enabled: true, allowClientAddresses: ['192.0.2.0/24'] } }),
      ),
    ).toEqual([])
  })

  it('does not flag when HTTPS is not enabled', () => {
    expect(evaluateConfigWarnings(inputs({ https: blankHTTPSConfig() }))).toEqual([])
  })
})

describe('evaluateConfigWarnings: SNMP weak community rule', () => {
  it('flags "public" and "private" communities, case-insensitively', () => {
    const snmp = {
      ...blankSNMPConfig(),
      communities: [
        { name: 'Public', clients: [], networks: [] },
        { name: 'PRIVATE', clients: [], networks: [] },
        { name: 'my-secret-community', clients: [], networks: [] },
      ],
    }
    const warnings = evaluateConfigWarnings(inputs({ snmp }))
    expect(warnings.map((w) => w.id)).toEqual(['snmp-weak-community-Public', 'snmp-weak-community-PRIVATE'])
  })

  it('does not flag a non-default community name', () => {
    const snmp = { ...blankSNMPConfig(), communities: [{ name: 'my-secret-community', clients: [], networks: [] }] }
    expect(evaluateConfigWarnings(inputs({ snmp }))).toEqual([])
  })

  it('returns nothing when there are no communities', () => {
    expect(evaluateConfigWarnings(inputs({ snmp: blankSNMPConfig() }))).toEqual([])
  })
})

describe('evaluateConfigWarnings: empty-secret user rule', () => {
  it('flags an enabled user with no password and no SSH key', () => {
    const warnings = evaluateConfigWarnings(inputs({ users: [user()] }))
    expect(warnings).toEqual([{ id: 'user-no-auth-alice', message: expect.stringContaining('alice') }])
  })

  it('does not flag a user with a password set', () => {
    expect(evaluateConfigWarnings(inputs({ users: [user({ hasPassword: true })] }))).toEqual([])
  })

  it('does not flag a user with a real SSH key set', () => {
    const withKey = user({ publicKeys: [{ identifier: 'alice@laptop', hasKey: true }] })
    expect(evaluateConfigWarnings(inputs({ users: [withKey] }))).toEqual([])
  })

  it('flags a user whose public-key entry exists but has no actual key data', () => {
    const brokenKey = user({ publicKeys: [{ identifier: 'alice@laptop', hasKey: false }] })
    expect(evaluateConfigWarnings(inputs({ users: [brokenKey] }))).toHaveLength(1)
  })

  it('does not flag a disabled user with no password/key', () => {
    expect(evaluateConfigWarnings(inputs({ users: [user({ disabled: true })] }))).toEqual([])
  })
})

describe('evaluateConfigWarnings: multiple rules combined', () => {
  it('returns warnings from every matching rule at once', () => {
    const warnings = evaluateConfigWarnings(
      inputs({
        rulesets: [ruleset({ id: 'input' })],
        ssh: { ...blankSSHConfig(), enabled: true },
        users: [user()],
      }),
    )
    expect(warnings.map((w) => w.id).sort()).toEqual(
      ['firewall-default-accept-ipv4-input', 'ssh-password-auth', 'user-no-auth-alice'].sort(),
    )
  })

  it('returns nothing when nothing is misconfigured', () => {
    expect(
      evaluateConfigWarnings(
        inputs({
          rulesets: [ruleset({ id: 'input', defaultAction: 'drop' })],
          users: [user({ hasPassword: true })],
        }),
      ),
    ).toEqual([])
  })
})

describe('buildConfigWarningFacts', () => {
  it('drops an unset optional field (defaultAction) entirely rather than keeping a JS undefined value', () => {
    // JSON.stringify omits keys whose value is `undefined` (rather than
    // emitting `null`) - JMESPath treats a missing key exactly like an
    // explicit null when evaluating a query (see the "flags an input base
    // chain with no default-action set" tests above), so this is enough to
    // normalize the facts object into pure JSON semantics.
    const facts = buildConfigWarningFacts(inputs({ rulesets: [ruleset({ id: 'input' })] }))
    const rulesets = facts.rulesets as Array<Record<string, unknown>>
    expect(Object.hasOwn(rulesets[0], 'defaultAction')).toBe(false)
  })

  it('adds a precomputed lower-cased nameLower field to each SNMP community', () => {
    const facts = buildConfigWarningFacts(
      inputs({ snmp: { ...blankSNMPConfig(), communities: [{ name: 'PubLIc', clients: [], networks: [] }] } }),
    )
    const snmp = facts.snmp as { communities: Array<{ name: string; nameLower: string }> }
    expect(snmp.communities[0]).toEqual({ name: 'PubLIc', clients: [], networks: [], nameLower: 'public' })
  })
})
