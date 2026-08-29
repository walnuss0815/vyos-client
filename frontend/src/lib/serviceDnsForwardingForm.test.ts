import { describe, expect, it } from 'vitest'
import {
  addNameServerOps,
  blankDNSForwardingDomainFormValues,
  blankDNSForwardingSettingsFormValues,
  deleteDNSForwardingDomainOp,
  disableDNSForwardingOp,
  dnsForwardingConfigToFormValues,
  dnsForwardingDomainFormToOps,
  dnsForwardingDomainToFormValues,
  dnsForwardingSettingsFormToOps,
  enableDNSForwardingOp,
  removeNameServerOp,
} from './serviceDnsForwardingForm'
import { blankDNSForwardingConfig, blankDNSForwardingDomain, type DNSForwardingDomain } from './serviceDnsForwardingTypes'

describe('dnsForwardingSettingsFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(dnsForwardingSettingsFormToOps(blankDNSForwardingConfig(), blankDNSForwardingSettingsFormValues())).toEqual([])
  })

  it('queues flag and scalar fields', () => {
    const values = blankDNSForwardingSettingsFormValues()
    values.useSystemNameServers = true
    values.port = '5353'

    expect(dnsForwardingSettingsFormToOps(blankDNSForwardingConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'dns', 'forwarding', 'system'] },
      { op: 'set', path: ['service', 'dns', 'forwarding', 'port'], value: '5353' },
    ])
  })

  it('queues a delete when cleared', () => {
    const before = { ...blankDNSForwardingConfig(), port: '5353' }
    const values = dnsForwardingConfigToFormValues(before)
    values.port = ''

    expect(dnsForwardingSettingsFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'dns', 'forwarding', 'port'] },
    ])
  })
})

describe('enableDNSForwardingOp / disableDNSForwardingOp', () => {
  it('builds the expected ops', () => {
    expect(enableDNSForwardingOp()).toEqual({ op: 'set', path: ['service', 'dns', 'forwarding'] })
    expect(disableDNSForwardingOp()).toEqual({ op: 'delete', path: ['service', 'dns', 'forwarding'] })
  })
})

function emptyDomain(overrides: Partial<DNSForwardingDomain> = {}): DNSForwardingDomain {
  return { fqdn: 'example.com', ...blankDNSForwardingDomain(), ...overrides }
}

describe('dnsForwardingDomainFormToOps', () => {
  it('always sets the domain tag for a brand-new domain', () => {
    expect(dnsForwardingDomainFormToOps('example.com', undefined, blankDNSForwardingDomainFormValues())).toEqual([
      { op: 'set', path: ['service', 'dns', 'forwarding', 'domain', 'example.com'] },
    ])
  })

  it('queues addnta and recursion-desired flags', () => {
    const values = blankDNSForwardingDomainFormValues()
    values.addnta = true
    values.recursionDesired = true

    const ops = dnsForwardingDomainFormToOps('example.com', undefined, values)
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['service', 'dns', 'forwarding', 'domain', 'example.com', 'addnta'] },
        { op: 'set', path: ['service', 'dns', 'forwarding', 'domain', 'example.com', 'recursion-desired'] },
      ]),
    )
  })

  it('queues nothing extra when editing unchanged', () => {
    const domain = emptyDomain({ addnta: true })
    expect(dnsForwardingDomainFormToOps('example.com', domain, dnsForwardingDomainToFormValues(domain))).toEqual([])
  })
})

describe('deleteDNSForwardingDomainOp', () => {
  it('builds a delete op', () => {
    expect(deleteDNSForwardingDomainOp('example.com')).toEqual({
      op: 'delete',
      path: ['service', 'dns', 'forwarding', 'domain', 'example.com'],
    })
  })
})

describe('name server ops (shared shape)', () => {
  const base = ['service', 'dns', 'forwarding', 'name-server']

  it('always sets the address tag, plus port when given', () => {
    expect(addNameServerOps(base, '8.8.8.8', '5353')).toEqual([
      { op: 'set', path: [...base, '8.8.8.8'] },
      { op: 'set', path: [...base, '8.8.8.8', 'port'], value: '5353' },
    ])
  })

  it('omits port when blank', () => {
    expect(addNameServerOps(base, '8.8.8.8', '')).toEqual([{ op: 'set', path: [...base, '8.8.8.8'] }])
  })

  it('builds a remove op', () => {
    expect(removeNameServerOp(base, '8.8.8.8')).toEqual({ op: 'delete', path: [...base, '8.8.8.8'] })
  })
})
