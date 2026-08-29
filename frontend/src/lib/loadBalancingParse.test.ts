import { describe, expect, it } from 'vitest'
import {
  haproxyBackendPath,
  haproxyServicePath,
  parseHAProxyConfig,
  parseLoadBalancingConfig,
  parseWANConfig,
  wanInterfaceHealthPath,
  wanRulePath,
} from './loadBalancingParse'

describe('parseWANConfig', () => {
  it('parses global toggles, interface health with nested tests, and rules with nested interfaces/limit', () => {
    const wan = {
      'disable-source-nat': {},
      'enable-local-traffic': {},
      'only-default-route': {},
      hook: '/config/scripts/hook.sh',
      'sticky-connections': { inbound: {} },
      'interface-health': {
        eth0: {
          nexthop: '192.0.2.1',
          'failure-count': '3',
          test: {
            '0': { type: 'ping', target: '9.9.9.9', 'resp-time': '10' },
          },
        },
      },
      rule: {
        '10': {
          description: 'primary',
          source: { address: '10.0.0.0/24', group: { 'address-group': 'LAN-hosts' } },
          destination: { port: '443' },
          failover: {},
          'inbound-interface': 'eth1',
          interface: { eth0: { weight: '5' } },
          limit: { rate: '10', period: 'minute', burst: '20', threshold: 'above' },
          protocol: 'tcp',
        },
      },
    }

    const parsed = parseWANConfig(wan)
    expect(parsed.disableSourceNat).toBe(true)
    expect(parsed.enableLocalTraffic).toBe(true)
    expect(parsed.flushConnections).toBe(false)
    expect(parsed.onlyDefaultRoute).toBe(true)
    expect(parsed.hook).toBe('/config/scripts/hook.sh')
    expect(parsed.stickyInbound).toBe(true)

    expect(parsed.interfaceHealth).toHaveLength(1)
    expect(parsed.interfaceHealth[0]).toEqual({
      interface: 'eth0',
      nexthop: '192.0.2.1',
      failureCount: 3,
      successCount: 1,
      tests: [{ id: '0', type: 'ping', target: '9.9.9.9', testScript: undefined, respTime: 10, ttlLimit: 1 }],
    })

    expect(parsed.rules).toHaveLength(1)
    const rule = parsed.rules[0]
    expect(rule.id).toBe('10')
    expect(rule.description).toBe('primary')
    expect(rule.source).toEqual({ address: '10.0.0.0/24', addressGroup: 'LAN-hosts' })
    expect(rule.destination.port).toBe('443')
    expect(rule.failover).toBe(true)
    expect(rule.exclude).toBe(false)
    expect(rule.inboundInterface).toBe('eth1')
    expect(rule.interfaces).toEqual([{ name: 'eth0', weight: 5 }])
    expect(rule.limit).toEqual({ rate: 10, period: 'minute', burst: 20, threshold: 'above' })
    expect(rule.protocol).toBe('tcp')
  })

  it('defaults protocol to "all" and omits limit when the rule has none', () => {
    const wan = { rule: { '1': { exclude: {} } } }
    const parsed = parseWANConfig(wan)
    expect(parsed.rules[0].protocol).toBe('all')
    expect(parsed.rules[0].limit).toBeUndefined()
    expect(parsed.rules[0].interfaces).toEqual([])
  })

  it('returns empty lists and false flags for an empty tree', () => {
    const parsed = parseWANConfig(undefined)
    expect(parsed.interfaceHealth).toEqual([])
    expect(parsed.rules).toEqual([])
    expect(parsed.disableSourceNat).toBe(false)
  })

  // Regression test: numberOrUndefined used to check `!Number.isNaN(n)`
  // alone, which lets Number("Infinity")/Number("-Infinity") through
  // as "valid" - both parse to real (non-NaN) JS numbers despite
  // never being a sane value for a field like weight.
  it('treats an "Infinity" string value as absent, not a real number', () => {
    const wan = { rule: { '1': { interface: { eth0: { weight: 'Infinity' } } } } }
    const parsed = parseWANConfig(wan)
    expect(parsed.rules[0].interfaces).toEqual([{ name: 'eth0', weight: 1 }]) // falls back to the documented default
  })
})

describe('parseHAProxyConfig', () => {
  it('parses a service with listen-addresses, http-response-headers, rules, and http-compression', () => {
    const haproxy = {
      service: {
        web: {
          backend: ['app-servers'],
          description: 'Public web frontend',
          'listen-address': { '0.0.0.0': { 'accept-proxy': {} } },
          logging: { facility: { local0: { level: 'info' } } },
          mode: 'http',
          port: '443',
          rule: {
            '1': {
              'domain-name': ['example.com'],
              'wildcard-domain': {},
              'url-path': { begin: ['/api'] },
              set: { backend: 'app-servers' },
            },
          },
          'redirect-http-to-https': {},
          'http-compression': { algorithm: 'gzip', 'mime-type': ['text/html'] },
          'http-response-headers': { 'X-Frame-Options': { value: 'DENY' } },
          ssl: { certificate: ['web-cert'] },
        },
      },
      backend: {
        'app-servers': {
          balance: 'least-connection',
          'http-check': { method: 'get', uri: '/health', expect: { status: '200' } },
          server: { app1: { address: '10.0.0.5', port: '8080', backup: {} } },
          ssl: { 'no-verify': {} },
          timeout: { tunnel: '600' },
        },
      },
    }

    const parsed = parseHAProxyConfig(haproxy)
    expect(parsed.services).toHaveLength(1)
    const service = parsed.services[0]
    expect(service.name).toBe('web')
    expect(service.backends).toEqual(['app-servers'])
    expect(service.listenAddresses).toEqual([{ address: '0.0.0.0', acceptProxy: true }])
    expect(service.logging).toEqual({ facility: 'local0', level: 'info' })
    expect(service.port).toBe(443)
    expect(service.rules).toEqual([
      {
        id: '1',
        domainNames: ['example.com'],
        wildcardDomain: true,
        ssl: undefined,
        urlPathBegin: ['/api'],
        urlPathEnd: [],
        urlPathExact: [],
        setRedirectLocation: undefined,
        setBackend: 'app-servers',
        setServer: undefined,
      },
    ])
    expect(service.redirectHttpToHttps).toBe(true)
    expect(service.httpCompressionAlgorithm).toBe('gzip')
    expect(service.httpCompressionMimeTypes).toEqual(['text/html'])
    expect(service.httpResponseHeaders).toEqual([{ id: 'X-Frame-Options', value: 'DENY' }])
    expect(service.sslCertificates).toEqual(['web-cert'])

    expect(parsed.backends).toHaveLength(1)
    const backend = parsed.backends[0]
    expect(backend.name).toBe('app-servers')
    expect(backend.balance).toBe('least-connection')
    expect(backend.httpCheckMethod).toBe('get')
    expect(backend.httpCheckUri).toBe('/health')
    expect(backend.httpCheckExpectStatus).toBe(200)
    expect(backend.servers).toEqual([
      { name: 'app1', address: '10.0.0.5', port: 8080, backup: true, checkPort: undefined, sendProxy: false, sendProxyV2: false },
    ])
    expect(backend.sslNoVerify).toBe(true)
    expect(backend.timeoutTunnel).toBe(600)
    expect(backend.timeoutCheck).toBeUndefined()
  })

  it('applies documented defaults (balance, mode, global timeout/tls) when a field was never set', () => {
    const parsed = parseHAProxyConfig({ service: { web: {} }, backend: { b1: {} } })
    expect(parsed.services[0].mode).toBe('http')
    expect(parsed.backends[0].balance).toBe('round-robin')
    expect(parsed.globalTimeout).toEqual({ check: 5, connect: 10, client: 50, server: 50, tunnel: 300 })
    expect(parsed.globalParameters.tlsVersionMin).toBe('1.3')
  })

  it('reads global-parameters and vrf', () => {
    const parsed = parseHAProxyConfig({
      'global-parameters': { 'max-connections': '5000', 'tls-version-min': '1.2' },
      vrf: 'RED',
    })
    expect(parsed.globalParameters.maxConnections).toBe(5000)
    expect(parsed.globalParameters.tlsVersionMin).toBe('1.2')
    expect(parsed.vrf).toBe('RED')
  })
})

describe('parseLoadBalancingConfig', () => {
  it('splits the load-balancing subtree into wan and haproxy', () => {
    const parsed = parseLoadBalancingConfig({
      wan: { 'flush-connections': {} },
      haproxy: { service: { web: {} } },
    })
    expect(parsed.wan.flushConnections).toBe(true)
    expect(parsed.haproxy.services).toHaveLength(1)
  })
})

describe('path helpers', () => {
  it('build the expected absolute paths', () => {
    expect(wanInterfaceHealthPath('eth0', 'nexthop')).toEqual([
      'load-balancing', 'wan', 'interface-health', 'eth0', 'nexthop',
    ])
    expect(wanRulePath('10', 'protocol')).toEqual(['load-balancing', 'wan', 'rule', '10', 'protocol'])
    expect(haproxyServicePath('web', 'port')).toEqual(['load-balancing', 'haproxy', 'service', 'web', 'port'])
    expect(haproxyBackendPath('app-servers', 'balance')).toEqual([
      'load-balancing', 'haproxy', 'backend', 'app-servers', 'balance',
    ])
  })
})
