import { describe, expect, it } from 'vitest'
import {
  parseMatchGroup,
  parseQosConfig,
  qosClassPath,
  qosInterfacePath,
  qosMatchGroupPath,
  qosPolicyPath,
} from './qosParse'

describe('parseQosConfig: interfaces and match groups', () => {
  it('parses interface bindings', () => {
    const parsed = parseQosConfig({ interface: { eth0: { ingress: 'MY-LIMITER', egress: 'MY-SHAPER' } } })
    expect(parsed.interfaces).toEqual([{ interface: 'eth0', ingress: 'MY-LIMITER', egress: 'MY-SHAPER' }])
  })

  it('parses a match group with a full match rule', () => {
    const parsed = parseQosConfig({
      'traffic-match-group': {
        WEB: {
          description: 'web traffic',
          match: {
            http: {
              ip: {
                destination: { port: '80,443' },
                protocol: 'tcp',
                dscp: 'AF11',
              },
              mark: '5',
              vif: '10',
            },
          },
        },
      },
    })
    expect(parsed.matchGroups).toHaveLength(1)
    const group = parsed.matchGroups[0]
    expect(group.name).toBe('WEB')
    expect(group.description).toBe('web traffic')
    expect(group.matches).toEqual([
      expect.objectContaining({
        id: 'http',
        ipDestinationPort: '80,443',
        ipProtocol: 'tcp',
        ipDscp: 'AF11',
        mark: 5,
        vif: 10,
      }),
    ])
  })

  it('parseMatchGroup handles a standalone raw node directly', () => {
    const group = parseMatchGroup('WEB', { match: {} })
    expect(group.name).toBe('WEB')
    expect(group.matches).toEqual([])
  })
})

describe('parseQosConfig: shaper', () => {
  it('parses a shaper policy with a class and default', () => {
    const parsed = parseQosConfig({
      policy: {
        shaper: {
          'WAN-OUT': {
            bandwidth: '100mbit',
            class: {
              '2': {
                bandwidth: '50mbit',
                ceiling: '80mbit',
                priority: 5,
                match: { web: { ip: { destination: { port: '443' } } } },
                'set-dscp': 'AF41',
              },
            },
            default: { bandwidth: '10mbit' },
          },
        },
      },
    })
    expect(parsed.shaperPolicies).toHaveLength(1)
    const policy = parsed.shaperPolicies[0]
    expect(policy.name).toBe('WAN-OUT')
    expect(policy.bandwidth).toBe('100mbit')
    expect(policy.classes).toHaveLength(1)
    expect(policy.classes[0].id).toBe('2')
    expect(policy.classes[0].ceiling).toBe('80mbit')
    expect(policy.classes[0].queueType).toBe('fq-codel')
    expect(policy.classes[0].setDscp).toBe('AF41')
    expect(policy.classes[0].matches).toHaveLength(1)
    expect(policy.defaultClass.bandwidth).toBe('10mbit')
    expect(policy.defaultClass.queueType).toBe('fq-codel')
  })

  it('defaults bandwidth to "auto" when unset', () => {
    const parsed = parseQosConfig({ policy: { shaper: { W: {} } } })
    expect(parsed.shaperPolicies[0].bandwidth).toBe('auto')
  })
})

describe('parseQosConfig: shaper-hfsc', () => {
  it('parses linkshare/realtime/upperlimit curves for a class', () => {
    const parsed = parseQosConfig({
      policy: {
        'shaper-hfsc': {
          W: {
            class: {
              '1': {
                linkshare: { m1: '10mbit', d: '10', m2: '5mbit' },
                realtime: { m2: '2mbit' },
              },
            },
          },
        },
      },
    })
    const policy = parsed.shaperHfscPolicies[0]
    expect(policy.classes[0].linkshare).toEqual({ m1: '10mbit', d: 10, m2: '5mbit' })
    expect(policy.classes[0].realtime).toEqual({ d: undefined, m1: undefined, m2: '2mbit' })
    expect(policy.classes[0].upperlimit).toEqual({ d: undefined, m1: undefined, m2: undefined })
  })
})

describe('parseQosConfig: limiter', () => {
  it('parses a class with police/burst/mtu and applies defaults', () => {
    const parsed = parseQosConfig({
      policy: {
        limiter: {
          IN: {
            class: {
              '1': { bandwidth: '10mbit', exceed: 'drop', 'not-exceed': 'ok' },
            },
          },
        },
      },
    })
    const policy = parsed.limiterPolicies[0]
    expect(policy.classes[0].burst).toBe('15k')
    expect(policy.classes[0].priority).toBe(20)
    expect(policy.classes[0].police).toEqual({ exceed: 'drop', notExceed: 'ok' })
  })

  // Regression test: numberOrUndefined used to check `!Number.isNaN(n)`
  // alone, which lets Number("Infinity")/Number("-Infinity") through
  // as "valid" - both parse to real (non-NaN) JS numbers despite
  // never being a sane value for a field like priority.
  it('treats an "Infinity" string value as absent, not a real number', () => {
    const parsed = parseQosConfig({
      policy: { limiter: { IN: { class: { '1': { priority: 'Infinity' } } } } },
    })
    expect(parsed.limiterPolicies[0].classes[0].priority).toBe(20) // falls back to the documented default
  })
})

describe('parseQosConfig: priority-queue and round-robin', () => {
  it('applies each type\'s own default queue-type for the default class', () => {
    const parsed = parseQosConfig({
      policy: {
        'priority-queue': { P: {} },
        'round-robin': { R: {} },
      },
    })
    expect(parsed.priorityQueuePolicies[0].defaultClass.queueType).toBe('drop-tail')
    expect(parsed.roundRobinPolicies[0].defaultClass.queueType).toBe('fair-queue')
  })

  it('parses a round-robin class including its quantum field', () => {
    const parsed = parseQosConfig({
      policy: { 'round-robin': { R: { class: { '1': { quantum: '1500' } } } } },
    })
    expect(parsed.roundRobinPolicies[0].classes[0].quantum).toBe(1500)
  })
})

describe('parseQosConfig: cake / fq-codel / rate-control', () => {
  it('parses cake with defaults applied', () => {
    const parsed = parseQosConfig({ policy: { cake: { C: { bandwidth: '1gbit' } } } })
    expect(parsed.cakePolicies[0]).toEqual({
      name: 'C',
      description: undefined,
      bandwidth: '1gbit',
      flowIsolation: 'triple-isolate',
      flowIsolationNat: false,
      noSplitGso: false,
      ackFilterAggressive: false,
      rtt: 100,
    })
  })

  it('parses fq-codel scalar fields', () => {
    const parsed = parseQosConfig({ policy: { 'fq-codel': { F: { target: '5', 'queue-limit': '10240' } } } })
    expect(parsed.fqCodelPolicies[0].target).toBe(5)
    expect(parsed.fqCodelPolicies[0].queueLimit).toBe(10240)
  })

  it('parses rate-control with defaults applied', () => {
    const parsed = parseQosConfig({ policy: { 'rate-control': { RC: { bandwidth: '10mbit' } } } })
    expect(parsed.rateControlPolicies[0].burst).toBe('15k')
    expect(parsed.rateControlPolicies[0].latency).toBe(50)
  })
})

describe('path helpers', () => {
  it('build the expected absolute paths', () => {
    expect(qosInterfacePath('eth0', 'egress')).toEqual(['qos', 'interface', 'eth0', 'egress'])
    expect(qosPolicyPath('shaper', 'WAN-OUT', 'bandwidth')).toEqual(['qos', 'policy', 'shaper', 'WAN-OUT', 'bandwidth'])
    expect(qosClassPath('shaper', 'WAN-OUT', '2', 'ceiling')).toEqual([
      'qos', 'policy', 'shaper', 'WAN-OUT', 'class', '2', 'ceiling',
    ])
    expect(qosMatchGroupPath('WEB', 'description')).toEqual(['qos', 'traffic-match-group', 'WEB', 'description'])
  })
})
