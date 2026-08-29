import { describe, expect, it } from 'vitest'
import { blankRuleFormValues, deleteRuleOp, ruleFormToOps, ruleToFormValues } from './natRuleForm'
import type { NATRule } from './natTypes'

function emptyRule(kind: NATRule['kind'], overrides: Partial<NATRule> = {}): NATRule {
  return {
    kind,
    number: '100',
    source: {},
    destination: {},
    disabled: false,
    exclude: false,
    log: false,
    ...overrides,
  }
}

describe('ruleFormToOps - creating a new source rule', () => {
  it('queues nothing for a blank form', () => {
    expect(ruleFormToOps('source', '100', undefined, blankRuleFormValues())).toEqual([])
  })

  it('queues masquerade translation with an outbound interface and source match', () => {
    const values = blankRuleFormValues()
    values.interfaceName = 'eth0'
    values.source.address = '192.168.0.0/24'
    values.translationAddress = 'masquerade'

    const ops = ruleFormToOps('source', '100', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['nat', 'source', 'rule', '100', 'source', 'address'], value: '192.168.0.0/24' },
        { op: 'set', path: ['nat', 'source', 'rule', '100', 'translation', 'address'], value: 'masquerade' },
        { op: 'set', path: ['nat', 'source', 'rule', '100', 'outbound-interface', 'name'], value: 'eth0' },
      ]),
    )
    expect(ops).toHaveLength(3)
  })

  it('queues group matching', () => {
    const values = blankRuleFormValues()
    values.source.addressGroup = 'LAN_HOSTS'
    values.destination.portGroup = 'WEB_PORTS'

    const ops = ruleFormToOps('source', '100', undefined, values)

    expect(ops).toContainEqual({
      op: 'set',
      path: ['nat', 'source', 'rule', '100', 'source', 'group', 'address-group'],
      value: 'LAN_HOSTS',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['nat', 'source', 'rule', '100', 'destination', 'group', 'port-group'],
      value: 'WEB_PORTS',
    })
  })

  it('queues disable/exclude/log flags', () => {
    const values = blankRuleFormValues()
    values.disabled = true
    values.exclude = true
    values.log = true

    const ops = ruleFormToOps('source', '100', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['nat', 'source', 'rule', '100', 'disable'] },
        { op: 'set', path: ['nat', 'source', 'rule', '100', 'exclude'] },
        { op: 'set', path: ['nat', 'source', 'rule', '100', 'log'] },
      ]),
    )
  })
})

describe('ruleFormToOps - creating a new destination rule', () => {
  it('uses inbound-interface instead of outbound-interface', () => {
    const values = blankRuleFormValues()
    values.interfaceName = 'eth0'

    const ops = ruleFormToOps('destination', '10', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['nat', 'destination', 'rule', '10', 'inbound-interface', 'name'], value: 'eth0' },
    ])
  })

  it('queues a port-forward: destination port + protocol + translation address/port', () => {
    const values = blankRuleFormValues()
    values.destination.port = '80'
    values.protocol = 'tcp'
    values.translationAddress = '192.168.0.100'
    values.translationPort = '8080'

    const ops = ruleFormToOps('destination', '10', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['nat', 'destination', 'rule', '10', 'destination', 'port'], value: '80' },
        { op: 'set', path: ['nat', 'destination', 'rule', '10', 'protocol'], value: 'tcp' },
        {
          op: 'set',
          path: ['nat', 'destination', 'rule', '10', 'translation', 'address'],
          value: '192.168.0.100',
        },
        { op: 'set', path: ['nat', 'destination', 'rule', '10', 'translation', 'port'], value: '8080' },
      ]),
    )
  })

  it('queues a redirect-to-localhost rule', () => {
    const values = blankRuleFormValues()
    values.redirectPort = '22'

    const ops = ruleFormToOps('destination', '10', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['nat', 'destination', 'rule', '10', 'translation', 'redirect', 'port'], value: '22' },
    ])
  })
})

describe('ruleFormToOps - editing an existing rule', () => {
  it('queues nothing when unchanged', () => {
    const rule = emptyRule('source', { translationAddress: 'masquerade' })
    expect(ruleFormToOps('source', '100', rule, ruleToFormValues(rule))).toEqual([])
  })

  it('diffs a single field', () => {
    const rule = emptyRule('source', { protocol: 'tcp' })
    const values = ruleToFormValues(rule)
    values.protocol = 'udp'

    const ops = ruleFormToOps('source', '100', rule, values)

    expect(ops).toEqual([
      { op: 'set', path: ['nat', 'source', 'rule', '100', 'protocol'], value: 'udp' },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const rule = emptyRule('source', { description: 'old' })
    const values = ruleToFormValues(rule)
    values.description = ''

    const ops = ruleFormToOps('source', '100', rule, values)

    expect(ops).toEqual([{ op: 'delete', path: ['nat', 'source', 'rule', '100', 'description'] }])
  })

  it('diffs the interface field using the correct path for the rule kind', () => {
    const rule = emptyRule('destination', { interfaceName: 'eth0' })
    const values = ruleToFormValues(rule)
    values.interfaceName = 'eth1'

    const ops = ruleFormToOps('destination', '10', rule, values)

    expect(ops).toEqual([
      {
        op: 'set',
        path: ['nat', 'destination', 'rule', '10', 'inbound-interface', 'name'],
        value: 'eth1',
      },
    ])
  })

  it('queues a flag delete when unchecked', () => {
    const rule = emptyRule('source', { exclude: true })
    const values = ruleToFormValues(rule)
    values.exclude = false

    const ops = ruleFormToOps('source', '100', rule, values)

    expect(ops).toEqual([{ op: 'delete', path: ['nat', 'source', 'rule', '100', 'exclude'] }])
  })
})

describe('deleteRuleOp', () => {
  it('builds a delete op for the whole rule', () => {
    expect(deleteRuleOp('destination', '10')).toEqual({
      op: 'delete',
      path: ['nat', 'destination', 'rule', '10'],
    })
  })
})
