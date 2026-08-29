import { describe, expect, it } from 'vitest'
import { mdnsRepeaterPath, parseMdnsRepeaterConfig } from './serviceMdnsParse'

describe('parseMdnsRepeaterConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseMdnsRepeaterConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseMdnsRepeaterConfig({}).enabled).toBe(true)
  })

  it('parses interfaces, ip-version, browse-domain, allow-service, cache-entries, and flags', () => {
    const repeater = {
      disable: {},
      interface: ['eth0', 'eth1'],
      'ip-version': 'ipv4',
      'browse-domain': ['example.com'],
      'allow-service': ['_http._tcp'],
      'cache-entries': '8192',
      'vrrp-disable': {},
    }
    const config = parseMdnsRepeaterConfig(repeater)
    expect(config).toEqual({
      enabled: true,
      disabled: true,
      interfaces: ['eth0', 'eth1'],
      ipVersion: 'ipv4',
      browseDomains: ['example.com'],
      allowServices: ['_http._tcp'],
      cacheEntries: '8192',
      vrrpDisable: true,
    })
  })
})

describe('path builders', () => {
  it('builds the two-level nested path', () => {
    expect(mdnsRepeaterPath('ip-version')).toEqual(['service', 'mdns', 'repeater', 'ip-version'])
  })
})
