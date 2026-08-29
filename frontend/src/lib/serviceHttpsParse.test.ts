import { describe, expect, it } from 'vitest'
import {
  httpsAllowClientPath,
  httpsApiKeyPath,
  httpsCertificatesPath,
  httpsGraphqlAuthPath,
  httpsGraphqlCorsPath,
  httpsPath,
  parseHTTPSConfig,
} from './serviceHttpsParse'

describe('parseHTTPSConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseHTTPSConfig(undefined).enabled).toBe(false)
  })

  it('marks the service enabled when the node is present, even if empty', () => {
    expect(parseHTTPSConfig({}).enabled).toBe(true)
  })

  it('parses API keys without leaking the key value', () => {
    const https = { api: { keys: { id: { 'my-key': { key: 'super-secret-value' } } } } }
    const config = parseHTTPSConfig(https)
    expect(config.apiKeys).toEqual([{ id: 'my-key', hasKey: true }])
    expect(JSON.stringify(config)).not.toContain('super-secret-value')
  })

  it('parses rest/graphql/cors settings', () => {
    const https = {
      api: {
        rest: { strict: {} },
        graphql: {
          introspection: {},
          authentication: { type: 'token', expiration: '7200', 'secret-length': '64' },
          cors: { 'allow-origin': ['https://example.com'] },
        },
      },
    }
    const config = parseHTTPSConfig(https)
    expect(config.restStrict).toBe(true)
    expect(config.graphqlIntrospection).toBe(true)
    expect(config.graphqlAuthType).toBe('token')
    expect(config.graphqlExpiration).toBe('7200')
    expect(config.graphqlSecretLength).toBe('64')
    expect(config.graphqlCorsAllowOrigins).toEqual(['https://example.com'])
  })

  it('parses allow-client, enable-http-redirect, listen-address, port, and request-body-size-limit', () => {
    const https = {
      'allow-client': { address: ['192.0.2.0/24'] },
      'enable-http-redirect': {},
      'listen-address': ['192.0.2.1'],
      port: '8443',
      'request-body-size-limit': '5',
    }
    const config = parseHTTPSConfig(https)
    expect(config.allowClientAddresses).toEqual(['192.0.2.0/24'])
    expect(config.enableHttpRedirect).toBe(true)
    expect(config.listenAddresses).toEqual(['192.0.2.1'])
    expect(config.port).toBe('8443')
    expect(config.requestBodySizeLimit).toBe('5')
  })

  it('parses certificates, tls-version, and vrf', () => {
    const https = {
      certificates: { 'ca-certificate': 'my-ca', certificate: 'my-cert', 'dh-params': 'my-dh' },
      'tls-version': ['1.2', '1.3'],
      vrf: 'RED',
    }
    const config = parseHTTPSConfig(https)
    expect(config.caCertificate).toBe('my-ca')
    expect(config.certificate).toBe('my-cert')
    expect(config.dhParams).toBe('my-dh')
    expect(config.tlsVersions).toEqual(['1.2', '1.3'])
    expect(config.vrf).toBe('RED')
  })
})

describe('path builders', () => {
  it('builds an https base path', () => {
    expect(httpsPath('port')).toEqual(['service', 'https', 'port'])
  })

  it('builds an api key path', () => {
    expect(httpsApiKeyPath('my-key', 'key')).toEqual([
      'service',
      'https',
      'api',
      'keys',
      'id',
      'my-key',
      'key',
    ])
  })

  it('builds graphql auth and cors paths', () => {
    expect(httpsGraphqlAuthPath('type')).toEqual([
      'service',
      'https',
      'api',
      'graphql',
      'authentication',
      'type',
    ])
    expect(httpsGraphqlCorsPath('allow-origin')).toEqual([
      'service',
      'https',
      'api',
      'graphql',
      'cors',
      'allow-origin',
    ])
  })

  it('builds allow-client and certificates paths', () => {
    expect(httpsAllowClientPath('address')).toEqual(['service', 'https', 'allow-client', 'address'])
    expect(httpsCertificatesPath('certificate')).toEqual([
      'service',
      'https',
      'certificates',
      'certificate',
    ])
  })
})
