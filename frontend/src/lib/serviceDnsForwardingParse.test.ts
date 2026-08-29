import { describe, expect, it } from 'vitest'
import {
  dnsForwardingDomainNameServerPath,
  dnsForwardingDomainPath,
  dnsForwardingForwarderPath,
  dnsForwardingPath,
  parseDNSForwardingConfig,
} from './serviceDnsForwardingParse'

describe('parseDNSForwardingConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseDNSForwardingConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseDNSForwardingConfig({}).enabled).toBe(true)
  })

  it('parses scalar and flag fields', () => {
    const forwarding = {
      'cache-size': '20000',
      dnssec: 'validate',
      'ignore-hosts-file': {},
      'no-serve-rfc1918': {},
      'negative-ttl': '1800',
      system: {},
      port: '5353',
    }
    const config = parseDNSForwardingConfig(forwarding)
    expect(config).toMatchObject({
      cacheSize: '20000',
      dnssec: 'validate',
      ignoreHostsFile: true,
      noServeRfc1918: true,
      negativeTtl: '1800',
      useSystemNameServers: true,
      port: '5353',
    })
  })

  it('parses dhcp, allow-from, listen-address, and source-address as multi-valued', () => {
    const forwarding = {
      dhcp: ['eth0'],
      'allow-from': ['192.0.2.0/24'],
      'listen-address': ['192.0.2.1'],
      'source-address': ['192.0.2.1'],
    }
    const config = parseDNSForwardingConfig(forwarding)
    expect(config.dhcpInterfaces).toEqual(['eth0'])
    expect(config.allowFrom).toEqual(['192.0.2.0/24'])
    expect(config.listenAddresses).toEqual(['192.0.2.1'])
    expect(config.sourceAddresses).toEqual(['192.0.2.1'])
  })

  it('parses the top-level name-server as system-wide forwarders', () => {
    const forwarding = { 'name-server': { '8.8.8.8': { port: '5353' }, '1.1.1.1': {} } }
    const config = parseDNSForwardingConfig(forwarding)
    expect(config.forwarders).toEqual([
      { address: '1.1.1.1', port: undefined },
      { address: '8.8.8.8', port: '5353' },
    ])
  })

  it('parses per-domain forwarders as a nested tag-within-tag structure', () => {
    const forwarding = {
      domain: {
        'example.com': {
          'name-server': { '192.0.2.53': { port: '53' } },
          addnta: {},
          'recursion-desired': {},
        },
      },
    }
    const config = parseDNSForwardingConfig(forwarding)
    expect(config.domains).toEqual([
      {
        fqdn: 'example.com',
        nameServers: [{ address: '192.0.2.53', port: '53' }],
        addnta: true,
        recursionDesired: true,
      },
    ])
  })

  it('sorts domains and forwarders', () => {
    const forwarding = {
      domain: { zeta: {}, alpha: {} },
      'name-server': { '9.9.9.9': {}, '1.1.1.1': {} },
    }
    const config = parseDNSForwardingConfig(forwarding)
    expect(config.domains.map((d) => d.fqdn)).toEqual(['alpha', 'zeta'])
    expect(config.forwarders.map((f) => f.address)).toEqual(['1.1.1.1', '9.9.9.9'])
  })
})

describe('path builders', () => {
  it('builds a base path', () => {
    expect(dnsForwardingPath('cache-size')).toEqual(['service', 'dns', 'forwarding', 'cache-size'])
  })

  it('builds a domain path', () => {
    expect(dnsForwardingDomainPath('example.com', 'addnta')).toEqual([
      'service',
      'dns',
      'forwarding',
      'domain',
      'example.com',
      'addnta',
    ])
  })

  it('builds a forwarder path', () => {
    expect(dnsForwardingForwarderPath('8.8.8.8', 'port')).toEqual([
      'service',
      'dns',
      'forwarding',
      'name-server',
      '8.8.8.8',
      'port',
    ])
  })

  it('builds a domain name-server path', () => {
    expect(dnsForwardingDomainNameServerPath('example.com', '192.0.2.53', 'port')).toEqual([
      'service',
      'dns',
      'forwarding',
      'domain',
      'example.com',
      'name-server',
      '192.0.2.53',
      'port',
    ])
  })
})
