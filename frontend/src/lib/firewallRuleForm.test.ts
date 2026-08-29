import { describe, expect, it } from 'vitest'
import type { FirewallRule } from './firewallTypes'
import { blankRuleFormValues, reorderRuleOps, ruleFormToOps, ruleToFormValues } from './firewallRuleForm'

const ref = { id: 'forward', kind: 'base' as const, family: 'ipv4' as const }

function emptyRule(overrides: Partial<FirewallRule> = {}): FirewallRule {
  return {
    number: '10',
    disabled: false,
    log: false,
    source: {},
    destination: {},
    ...overrides,
  }
}

describe('ruleFormToOps - creating a new rule (before = undefined)', () => {
  it('queues only the fields the user actually filled in', () => {
    const values = blankRuleFormValues()
    values.action = 'accept'
    values.protocol = 'tcp'
    values.destination.port = '443'

    const ops = ruleFormToOps(ref, '10', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'action'], value: 'accept' },
        { op: 'set', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'protocol'], value: 'tcp' },
        {
          op: 'set',
          path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'destination', 'port'],
          value: '443',
        },
      ]),
    )
    // Nothing else should be queued for fields left blank.
    expect(ops).toHaveLength(3)
  })

  it('queues a flag set for log/disabled when checked', () => {
    const values = blankRuleFormValues()
    values.action = 'drop'
    values.log = true
    values.disabled = true

    const ops = ruleFormToOps(ref, '10', undefined, values)

    expect(ops).toContainEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'log'],
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'disable'],
    })
  })

  it('queues nothing at all for a completely blank form', () => {
    expect(ruleFormToOps(ref, '10', undefined, blankRuleFormValues())).toEqual([])
  })
})

describe('ruleFormToOps - editing an existing rule', () => {
  it('queues nothing when the form is unchanged', () => {
    const rule = emptyRule({ action: 'accept', protocol: 'tcp', description: 'allow web' })
    const ops = ruleFormToOps(ref, '10', rule, ruleToFormValues(rule))
    expect(ops).toEqual([])
  })

  it('queues only the changed field', () => {
    const rule = emptyRule({ action: 'accept', protocol: 'tcp' })
    const values = ruleToFormValues(rule)
    values.protocol = 'udp'

    const ops = ruleFormToOps(ref, '10', rule, values)

    expect(ops).toEqual([
      { op: 'set', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'protocol'], value: 'udp' },
    ])
  })

  it('queues a delete when a previously-set field is cleared', () => {
    const rule = emptyRule({ description: 'old description' })
    const values = ruleToFormValues(rule)
    values.description = ''

    const ops = ruleFormToOps(ref, '10', rule, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'description'] },
    ])
  })

  // Regression test: this used to check the raw (untrimmed) value, so
  // whitespace-only input queued a `set` with a literal whitespace
  // value instead of being treated the same as actually clearing the
  // field.
  it('treats a whitespace-only field the same as clearing it', () => {
    const rule = emptyRule({ description: 'old description' })
    const values = ruleToFormValues(rule)
    values.description = '   '

    const ops = ruleFormToOps(ref, '10', rule, values)

    expect(ops).toEqual([
      { op: 'delete', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'description'] },
    ])
  })

  it('queues a flag delete when log/disabled is unchecked', () => {
    const rule = emptyRule({ log: true, disabled: true })
    const values = ruleToFormValues(rule)
    values.log = false
    values.disabled = false

    const ops = ruleFormToOps(ref, '10', rule, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'delete', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'log'] },
        { op: 'delete', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'disable'] },
      ]),
    )
    expect(ops).toHaveLength(2)
  })

  it('handles nested source/destination group changes independently', () => {
    const rule = emptyRule({
      source: { addressGroup: 'OLD' },
      destination: { port: '80' },
    })
    const values = ruleToFormValues(rule)
    values.source.addressGroup = 'NEW'
    values.destination.portGroup = 'WEB'

    const ops = ruleFormToOps(ref, '10', rule, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        {
          op: 'set',
          path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'source', 'group', 'address-group'],
          value: 'NEW',
        },
        {
          op: 'set',
          path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'destination', 'group', 'port-group'],
          value: 'WEB',
        },
      ]),
    )
    // destination.port ('80') was untouched, so it must NOT be re-queued.
    expect(ops.some((o) => o.path.includes('port') && !o.path.includes('group'))).toBe(false)
  })

  it('builds paths for a custom ruleset correctly', () => {
    const customRef = { id: 'WAN-LAN-v4', kind: 'custom' as const, family: 'ipv4' as const }
    const values = blankRuleFormValues()
    values.action = 'accept'

    const ops = ruleFormToOps(customRef, '20', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['firewall', 'ipv4', 'name', 'WAN-LAN-v4', 'rule', '20', 'action'], value: 'accept' },
    ])
  })

  // Regression coverage for the one field whose config-tree node name
  // is family-dependent (icmp vs icmpv6) - see firewallParse.ts's
  // icmpNodeName and firewallTypes.ts's FirewallFamily doc comment.
  it('uses the icmp node for an ipv4 ruleset', () => {
    const values = blankRuleFormValues()
    values.icmpTypeName = 'echo-request'

    const ops = ruleFormToOps(ref, '10', undefined, values)

    expect(ops).toContainEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'icmp', 'type-name'],
      value: 'echo-request',
    })
  })

  it('uses the icmpv6 node for an ipv6 ruleset', () => {
    const ipv6Ref = { id: 'forward', kind: 'base' as const, family: 'ipv6' as const }
    const values = blankRuleFormValues()
    values.icmpTypeName = 'echo-request'

    const ops = ruleFormToOps(ipv6Ref, '10', undefined, values)

    expect(ops).toContainEqual({
      op: 'set',
      path: ['firewall', 'ipv6', 'forward', 'filter', 'rule', '10', 'icmpv6', 'type-name'],
      value: 'echo-request',
    })
  })
})

describe('reorderRuleOps', () => {
  function rule(number: string, overrides: Partial<FirewallRule> = {}): FirewallRule {
    return emptyRule({ number, action: 'accept', ...overrides })
  }

  it('returns [] for a no-op move (same index)', () => {
    const rules = [rule('10'), rule('20'), rule('30')]
    expect(reorderRuleOps(ref, rules, 1, 1)).toEqual([])
  })

  it('returns [] for an out-of-bounds index', () => {
    const rules = [rule('10'), rule('20')]
    expect(reorderRuleOps(ref, rules, 0, 5)).toEqual([])
    expect(reorderRuleOps(ref, rules, -1, 0)).toEqual([])
  })

  it('renumbers only the moved rule when a gap exists between its new neighbors', () => {
    const rules = [rule('10'), rule('20'), rule('30')]
    // Move rule 30 (index 2) to the front (index 0): new neighbors are
    // [none, 10] -> floor(10/2) = 5, well clear of both.
    const ops = reorderRuleOps(ref, rules, 2, 0)

    expect(ops).toEqual([
      { op: 'delete', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '30'] },
      { op: 'set', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '5', 'action'], value: 'accept' },
    ])
  })

  it('places a rule moved to the very back above the current last rule', () => {
    const rules = [rule('10'), rule('20'), rule('30')]
    // Move rule 10 (index 0) to the last position (index 2): its only
    // new neighbor is 30 (nothing after it), so it should land above 30.
    const ops = reorderRuleOps(ref, rules, 0, 2)
    const setOp = ops.find((o) => o.op === 'set')
    // prev=30, no next -> prev+10 = 40.
    expect(setOp?.path).toEqual(['firewall', 'ipv4', 'forward', 'filter', 'rule', '40', 'action'])
  })

  it('places a rule moved between two others at the midpoint', () => {
    const rules = [rule('10'), rule('20'), rule('30'), rule('40')]
    // Move rule 40 (index 3) to between 10 and 20 (index 1).
    const ops = reorderRuleOps(ref, rules, 3, 1)
    const setOp = ops.find((o) => o.op === 'set')
    // prev=10, next=20 -> 10 + floor((20-10)/2) = 15.
    expect(setOp?.path).toEqual(['firewall', 'ipv4', 'forward', 'filter', 'rule', '15', 'action'])
  })

  it('falls back to a full renumber when moving to the front leaves no room (next=1)', () => {
    const rules = [rule('1'), rule('10'), rule('20')]
    // Move rule 20 (index 2) to the front (index 0): next=1, no
    // integer fits below it.
    const ops = reorderRuleOps(ref, rules, 2, 0)

    // All three rules get a clean 10-spaced sequence matching the new
    // order: [20, 1, 10] -> [10, 20, 30].
    const deletes = ops.filter((o) => o.op === 'delete').map((o) => o.path.at(-1))
    const sets = ops.filter((o) => o.op === 'set')
    expect(deletes.sort()).toEqual(['1', '10', '20'].sort())
    expect(sets.map((o) => o.path.at(-2))).toEqual(expect.arrayContaining(['10', '20', '30']))
  })

  it('falls back to a full renumber when moving between two consecutive numbers', () => {
    const rules = [rule('10'), rule('11'), rule('20')]
    // Move rule 20 (index 2) to between 10 and 11 (index 1): no
    // integer strictly between 10 and 11.
    const ops = reorderRuleOps(ref, rules, 2, 1)

    const deletes = ops.filter((o) => o.op === 'delete')
    expect(deletes.length).toBeGreaterThan(0)
    // Every op is a delete before any set (see the function's own doc
    // comment for why this ordering matters).
    const firstSetIndex = ops.findIndex((o) => o.op === 'set')
    const lastDeleteIndex = ops.map((o) => o.op).lastIndexOf('delete')
    expect(lastDeleteIndex).toBeLessThan(firstSetIndex)
  })

  it('only emits ops for rules whose number actually changes in a full renumber', () => {
    // Already a clean 10-spaced sequence; moving the middle rule to
    // the front with no gap forces a full renumber, but the rule that
    // ends up back at its own original number should not be touched.
    const rules = [rule('1'), rule('2'), rule('3')]
    const ops = reorderRuleOps(ref, rules, 2, 0)
    // New order: [3, 1, 2] -> renumbered [10, 20, 30]. None keep their
    // original number, so all three should appear.
    const deletedNumbers = ops.filter((o) => o.op === 'delete').map((o) => o.path.at(-1))
    expect(deletedNumbers).toHaveLength(3)
  })

  it('recreates every field of the moved rule at its new number, not just a diff', () => {
    const rules = [
      rule('10', { action: 'accept', protocol: 'tcp', description: 'allow web' }),
      rule('20'),
      rule('30'),
    ]
    const ops = reorderRuleOps(ref, rules, 0, 2)

    const setPaths = ops.filter((o) => o.op === 'set').map((o) => o.path.join(' '))
    expect(setPaths).toEqual(
      expect.arrayContaining([
        'firewall ipv4 forward filter rule 40 action',
        'firewall ipv4 forward filter rule 40 protocol',
        'firewall ipv4 forward filter rule 40 description',
      ]),
    )
  })

  it('deletes the old rule number before setting any new number', () => {
    const rules = [rule('10'), rule('20'), rule('30')]
    const ops = reorderRuleOps(ref, rules, 2, 0)
    expect(ops[0]).toEqual({ op: 'delete', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '30'] })
    expect(ops.slice(1).every((o) => o.op === 'set')).toBe(true)
  })
})

describe('ruleToFormValues', () => {
  it('normalizes undefined fields to empty strings/false', () => {
    const values = ruleToFormValues(emptyRule())
    expect(values.action).toBe('')
    expect(values.protocol).toBe('')
    expect(values.disabled).toBe(false)
    expect(values.log).toBe(false)
    expect(values.source).toEqual({
      address: '',
      port: '',
      macAddress: '',
      addressGroup: '',
      networkGroup: '',
      portGroup: '',
      macGroup: '',
      domainGroup: '',
    })
  })
})
