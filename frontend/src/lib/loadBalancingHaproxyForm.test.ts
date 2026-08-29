import { describe, expect, it } from 'vitest'
import {
  addHAProxyListenAddressOps,
  addHAProxyServerOps,
  addHAProxyServiceRuleOps,
  blankHAProxyBackendFormValues,
  blankHAProxyServiceFormValues,
  deleteHAProxyBackendOp,
  deleteHAProxyServiceOp,
  haproxyBackendFormToOps,
  haproxyBackendToFormValues,
  haproxyGlobalParametersFormToOps,
  haproxyGlobalParametersToFormValues,
  haproxyGlobalTimeoutFormToOps,
  haproxyGlobalTimeoutToFormValues,
  haproxyServiceFormToOps,
  haproxyServiceToFormValues,
  removeHAProxyListenAddressOp,
  removeHAProxyServerOp,
  removeHAProxyServiceRuleOp,
  setHAProxyVrfOp,
} from './loadBalancingHaproxyForm'
import type { HAProxyBackend, HAProxyGlobalParameters, HAProxyGlobalTimeout, HAProxyService } from './loadBalancingTypes'

describe('HAProxy service form', () => {
  it('creates a new service with scalar fields and a logging facility', () => {
    const values = blankHAProxyServiceFormValues()
    values.description = 'Public web'
    values.port = '443'
    values.redirectHttpToHttps = true
    values.loggingFacility = 'local0'
    const ops = haproxyServiceFormToOps('web', undefined, values)

    expect(ops[0]).toEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'service', 'web', 'description'],
      value: 'Public web',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'service', 'web', 'port'],
      value: '443',
    })
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web', 'redirect-http-to-https'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'service', 'web', 'logging', 'facility', 'local0'],
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'service', 'web', 'logging', 'facility', 'local0', 'level'],
      value: 'err',
    })
  })

  it('emits nothing when editing with no changes', () => {
    const before: HAProxyService = {
      name: 'web',
      backends: ['app'],
      listenAddresses: [],
      logging: { level: 'err' },
      mode: 'http',
      rules: [],
      httpResponseHeaders: [],
      redirectHttpToHttps: false,
      httpCompressionMimeTypes: [],
      sslCertificates: [],
    }
    const ops = haproxyServiceFormToOps('web', before, haproxyServiceToFormValues(before))
    expect(ops).toEqual([])
  })

  it('replaces the logging facility (delete old, set new) when it changes', () => {
    const before: HAProxyService = {
      name: 'web',
      backends: [],
      listenAddresses: [],
      logging: { facility: 'local0', level: 'info' },
      mode: 'http',
      rules: [],
      httpResponseHeaders: [],
      redirectHttpToHttps: false,
      httpCompressionMimeTypes: [],
      sslCertificates: [],
    }
    const values = haproxyServiceToFormValues(before)
    values.loggingFacility = 'local1'
    const ops = haproxyServiceFormToOps('web', before, values)
    expect(ops).toEqual([
      { op: 'delete', path: ['load-balancing', 'haproxy', 'service', 'web', 'logging', 'facility', 'local0'] },
      { op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web', 'logging', 'facility', 'local1'] },
      {
        op: 'set',
        path: ['load-balancing', 'haproxy', 'service', 'web', 'logging', 'facility', 'local1', 'level'],
        value: 'info',
      },
    ])
  })

  it('deleteHAProxyServiceOp deletes the whole service tagNode', () => {
    expect(deleteHAProxyServiceOp('web')).toEqual({ op: 'delete', path: ['load-balancing', 'haproxy', 'service', 'web'] })
  })
})

describe('HAProxy nested lists (listen-address, rule, server)', () => {
  it('addHAProxyListenAddressOps sets accept-proxy only when requested', () => {
    expect(addHAProxyListenAddressOps('web', '0.0.0.0', true)).toEqual([
      { op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web', 'listen-address', '0.0.0.0'] },
      { op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web', 'listen-address', '0.0.0.0', 'accept-proxy'] },
    ])
    expect(addHAProxyListenAddressOps('web', '::1', false)).toEqual([
      { op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web', 'listen-address', '::1'] },
    ])
  })

  it('removeHAProxyListenAddressOp deletes the tagNode', () => {
    expect(removeHAProxyListenAddressOp('web', '0.0.0.0')).toEqual({
      op: 'delete',
      path: ['load-balancing', 'haproxy', 'service', 'web', 'listen-address', '0.0.0.0'],
    })
  })

  it('addHAProxyServiceRuleOps splits comma-separated domain names and sets only provided fields', () => {
    const ops = addHAProxyServiceRuleOps('web', '1', {
      domainNames: 'example.com, www.example.com',
      wildcardDomain: true,
      ssl: '',
      urlPathBegin: '/api',
      urlPathEnd: '',
      urlPathExact: '',
      setRedirectLocation: '',
      setBackend: 'app-servers',
      setServer: '',
    })
    expect(ops).toEqual([
      { op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web', 'rule', '1'] },
      { op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web', 'rule', '1', 'domain-name'], value: 'example.com' },
      {
        op: 'set',
        path: ['load-balancing', 'haproxy', 'service', 'web', 'rule', '1', 'domain-name'],
        value: 'www.example.com',
      },
      { op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web', 'rule', '1', 'wildcard-domain'] },
      { op: 'set', path: ['load-balancing', 'haproxy', 'service', 'web', 'rule', '1', 'url-path', 'begin'], value: '/api' },
      {
        op: 'set',
        path: ['load-balancing', 'haproxy', 'service', 'web', 'rule', '1', 'set', 'backend'],
        value: 'app-servers',
      },
    ])
  })

  it('removeHAProxyServiceRuleOp deletes the rule tagNode', () => {
    expect(removeHAProxyServiceRuleOp('web', '1')).toEqual({
      op: 'delete',
      path: ['load-balancing', 'haproxy', 'service', 'web', 'rule', '1'],
    })
  })

  it('addHAProxyServerOps only sets provided optional fields', () => {
    const ops = addHAProxyServerOps('app-servers', 'app1', {
      address: '10.0.0.5',
      port: '8080',
      backup: false,
      checkPort: '',
      sendProxy: false,
      sendProxyV2: true,
    })
    expect(ops).toEqual([
      { op: 'set', path: ['load-balancing', 'haproxy', 'backend', 'app-servers', 'server', 'app1'] },
      { op: 'set', path: ['load-balancing', 'haproxy', 'backend', 'app-servers', 'server', 'app1', 'address'], value: '10.0.0.5' },
      { op: 'set', path: ['load-balancing', 'haproxy', 'backend', 'app-servers', 'server', 'app1', 'port'], value: '8080' },
      { op: 'set', path: ['load-balancing', 'haproxy', 'backend', 'app-servers', 'server', 'app1', 'send-proxy-v2'] },
    ])
  })

  it('removeHAProxyServerOp deletes the server tagNode', () => {
    expect(removeHAProxyServerOp('app-servers', 'app1')).toEqual({
      op: 'delete',
      path: ['load-balancing', 'haproxy', 'backend', 'app-servers', 'server', 'app1'],
    })
  })
})

describe('HAProxy backend form', () => {
  it('creates a new backend with http-check and ssl fields', () => {
    const values = blankHAProxyBackendFormValues()
    values.balance = 'least-connection'
    values.httpCheckMethod = 'get'
    values.httpCheckUri = '/health'
    values.httpCheckExpectStatus = '200'
    values.sslNoVerify = true
    const ops = haproxyBackendFormToOps('app-servers', undefined, values)

    expect(ops[0]).toEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'backend', 'app-servers'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'backend', 'app-servers', 'balance'],
      value: 'least-connection',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'backend', 'app-servers', 'http-check', 'method'],
      value: 'get',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'backend', 'app-servers', 'http-check', 'expect', 'status'],
      value: '200',
    })
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'backend', 'app-servers', 'ssl', 'no-verify'] })
  })

  it('emits nothing when editing with no changes', () => {
    const before: HAProxyBackend = {
      name: 'app-servers',
      balance: 'round-robin',
      logging: { level: 'err' },
      mode: 'http',
      httpResponseHeaders: [],
      httpServerClose: false,
      rules: [],
      servers: [],
      sslNoVerify: false,
    }
    const ops = haproxyBackendFormToOps('app-servers', before, haproxyBackendToFormValues(before))
    expect(ops).toEqual([])
  })

  it('deleteHAProxyBackendOp deletes the whole backend tagNode', () => {
    expect(deleteHAProxyBackendOp('app-servers')).toEqual({
      op: 'delete',
      path: ['load-balancing', 'haproxy', 'backend', 'app-servers'],
    })
  })
})

describe('HAProxy global parameters / timeout / vrf', () => {
  it('diffs global parameters field by field', () => {
    const before: HAProxyGlobalParameters = {
      logging: { level: 'err' },
      sslBindCiphers: [],
      tlsVersionMin: '1.3',
    }
    const beforeValues = haproxyGlobalParametersToFormValues(before)
    const values = { ...beforeValues, maxConnections: '5000' }
    const ops = haproxyGlobalParametersFormToOps(beforeValues, values)
    expect(ops).toEqual([
      { op: 'set', path: ['load-balancing', 'haproxy', 'global-parameters', 'max-connections'], value: '5000' },
    ])
  })

  it('diffs the global timeout block field by field', () => {
    const before: HAProxyGlobalTimeout = { check: 5, connect: 10, client: 50, server: 50, tunnel: 300 }
    const beforeValues = haproxyGlobalTimeoutToFormValues(before)
    const values = { ...beforeValues, tunnel: '600' }
    const ops = haproxyGlobalTimeoutFormToOps(beforeValues, values)
    expect(ops).toEqual([{ op: 'set', path: ['load-balancing', 'haproxy', 'timeout', 'tunnel'], value: '600' }])
  })

  it('setHAProxyVrfOp deletes on blank, sets a trimmed value otherwise', () => {
    expect(setHAProxyVrfOp('  ')).toEqual({ op: 'delete', path: ['load-balancing', 'haproxy', 'vrf'] })
    expect(setHAProxyVrfOp(' RED ')).toEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'vrf'], value: 'RED' })
  })
})
