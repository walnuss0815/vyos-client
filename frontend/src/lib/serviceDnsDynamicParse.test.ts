import { describe, expect, it } from 'vitest'
import { dynamicDnsEntryPath, dynamicDnsPath, parseDynamicDNSConfig } from './serviceDnsDynamicParse'

describe('parseDynamicDNSConfig', () => {
  it('returns a blank config when absent', () => {
    expect(parseDynamicDNSConfig(undefined)).toEqual({ entries: [] })
  })

  it('parses a minimal entry with an interface-based address', () => {
    const dynamic = {
      name: { home: { protocol: 'cloudflare', address: { interface: 'eth0' }, server: 'ns.example.com' } },
    }
    const config = parseDynamicDNSConfig(dynamic)
    expect(config.entries).toHaveLength(1)
    expect(config.entries[0]).toMatchObject({
      name: 'home',
      protocol: 'cloudflare',
      addressMode: 'interface',
      addressInterface: 'eth0',
      server: 'ns.example.com',
    })
  })

  it('parses a web-based address', () => {
    const dynamic = {
      name: { home: { address: { web: { url: 'https://checkip.example.com', skip: 'IP:' } } } },
    }
    const [entry] = parseDynamicDNSConfig(dynamic).entries
    expect(entry.addressMode).toBe('web')
    expect(entry.addressWebUrl).toBe('https://checkip.example.com')
    expect(entry.addressWebSkip).toBe('IP:')
  })

  it('leaves addressMode undefined when neither is set', () => {
    const dynamic = { name: { home: {} } }
    const [entry] = parseDynamicDNSConfig(dynamic).entries
    expect(entry.addressMode).toBeUndefined()
  })

  it('parses host-name, username, hasPassword without leaking the value, key, and timing fields', () => {
    const dynamic = {
      name: {
        home: {
          'host-name': ['home.example.com', 'www.example.com'],
          username: 'alice',
          password: 'super-secret',
          key: '/config/auth/ddns.key',
          ttl: '300',
          'wait-time': '600',
          'expiry-time': '86400',
        },
      },
    }
    const [entry] = parseDynamicDNSConfig(dynamic).entries
    expect(entry.hostNames).toEqual(['home.example.com', 'www.example.com'])
    expect(entry.username).toBe('alice')
    expect(entry.hasPassword).toBe(true)
    expect(JSON.stringify(entry)).not.toContain('super-secret')
    expect(entry.key).toBe('/config/auth/ddns.key')
    expect(entry.ttl).toBe('300')
    expect(entry.waitTime).toBe('600')
    expect(entry.expiryTime).toBe('86400')
  })

  it('parses global interval and vrf', () => {
    const dynamic = { interval: '600', vrf: 'RED' }
    const config = parseDynamicDNSConfig(dynamic)
    expect(config.interval).toBe('600')
    expect(config.vrf).toBe('RED')
  })

  it('sorts entries by name', () => {
    const dynamic = { name: { zeta: {}, alpha: {} } }
    const config = parseDynamicDNSConfig(dynamic)
    expect(config.entries.map((e) => e.name)).toEqual(['alpha', 'zeta'])
  })
})

describe('path builders', () => {
  it('builds a dynamic dns base path', () => {
    expect(dynamicDnsPath('interval')).toEqual(['service', 'dns', 'dynamic', 'interval'])
  })

  it('builds an entry path', () => {
    expect(dynamicDnsEntryPath('home', 'server')).toEqual([
      'service',
      'dns',
      'dynamic',
      'name',
      'home',
      'server',
    ])
  })
})
