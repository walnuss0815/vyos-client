import { describe, expect, it } from 'vitest'
import {
  blankLocalRouteFormValues,
  deleteLocalRouteOp,
  localRouteFormToOps,
  localRouteToFormValues,
} from './localRouteForm'
import type { LocalRouteRule } from './policyTypes'

function emptyRule(overrides: Partial<LocalRouteRule> = {}): LocalRouteRule {
  return { family: 'ipv4', number: '100', sourceAddresses: [], destinationAddresses: [], ...overrides }
}

describe('localRouteFormToOps - creating a new rule', () => {
  it('queues nothing for a blank form', () => {
    expect(localRouteFormToOps('ipv4', '100', undefined, blankLocalRouteFormValues())).toEqual([])
  })

  it('queues protocol/fwmark/inbound-interface/table/vrf', () => {
    const values = blankLocalRouteFormValues()
    values.protocol = 'tcp'
    values.fwmark = '1'
    values.inboundInterface = 'eth0'
    values.table = '100'
    values.vrf = 'BLUE'

    const ops = localRouteFormToOps('ipv4', '100', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['policy', 'local-route', 'rule', '100', 'protocol'], value: 'tcp' },
        { op: 'set', path: ['policy', 'local-route', 'rule', '100', 'fwmark'], value: '1' },
        { op: 'set', path: ['policy', 'local-route', 'rule', '100', 'inbound-interface'], value: 'eth0' },
        { op: 'set', path: ['policy', 'local-route', 'rule', '100', 'set', 'table'], value: '100' },
        { op: 'set', path: ['policy', 'local-route', 'rule', '100', 'set', 'vrf'], value: 'BLUE' },
      ]),
    )
  })

  it('builds an ipv6 path for local-route6', () => {
    const values = blankLocalRouteFormValues()
    values.protocol = 'tcp'
    expect(localRouteFormToOps('ipv6', '100', undefined, values)).toEqual([
      { op: 'set', path: ['policy', 'local-route6', 'rule', '100', 'protocol'], value: 'tcp' },
    ])
  })

  it('queues source/destination ports', () => {
    const values = blankLocalRouteFormValues()
    values.sourcePort = '80'
    values.destinationPort = '443'

    const ops = localRouteFormToOps('ipv4', '100', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['policy', 'local-route', 'rule', '100', 'source', 'port'], value: '80' },
      { op: 'set', path: ['policy', 'local-route', 'rule', '100', 'destination', 'port'], value: '443' },
    ])
  })
})

describe('localRouteFormToOps - editing an existing rule', () => {
  it('queues nothing when unchanged', () => {
    const rule = emptyRule({ protocol: 'tcp' })
    expect(localRouteFormToOps('ipv4', '100', rule, localRouteToFormValues(rule))).toEqual([])
  })

  it('diffs a single field', () => {
    const rule = emptyRule({ table: '100' })
    const values = localRouteToFormValues(rule)
    values.table = '200'

    expect(localRouteFormToOps('ipv4', '100', rule, values)).toEqual([
      { op: 'set', path: ['policy', 'local-route', 'rule', '100', 'set', 'table'], value: '200' },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const rule = emptyRule({ vrf: 'BLUE' })
    const values = localRouteToFormValues(rule)
    values.vrf = ''

    expect(localRouteFormToOps('ipv4', '100', rule, values)).toEqual([
      { op: 'delete', path: ['policy', 'local-route', 'rule', '100', 'set', 'vrf'] },
    ])
  })
})

describe('deleteLocalRouteOp', () => {
  it('builds a delete op per family', () => {
    expect(deleteLocalRouteOp('ipv4', '100')).toEqual({
      op: 'delete',
      path: ['policy', 'local-route', 'rule', '100'],
    })
    expect(deleteLocalRouteOp('ipv6', '100')).toEqual({
      op: 'delete',
      path: ['policy', 'local-route6', 'rule', '100'],
    })
  })
})
