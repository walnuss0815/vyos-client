import { describe, expect, it } from 'vitest'
import {
  parsePKIConfig,
  pkiCAPath,
  pkiCertificatePath,
  pkiDHPath,
  pkiKeyPairPath,
  pkiX509DefaultsPath,
} from './pkiParse'

describe('parsePKIConfig - empty', () => {
  it('returns empty lists and blank defaults when pki is absent', () => {
    const config = parsePKIConfig(undefined)
    expect(config).toEqual({
      cas: [],
      certificates: [],
      dhParams: [],
      keyPairs: [],
      x509Defaults: {},
    })
  })
})

describe('parsePKIConfig - certificate authorities', () => {
  it('parses a CA with certificate, description, private key, and flags', () => {
    const pki = {
      ca: {
        vyos_root_ca: {
          description: 'Root CA',
          certificate: 'MIIB...',
          private: { key: 'MIIE...', 'password-protected': {} },
          crl: ['MIIC...'],
          'system-install': {},
          revoke: {},
        },
      },
    }
    const config = parsePKIConfig(pki)
    expect(config.cas).toEqual([
      {
        name: 'vyos_root_ca',
        description: 'Root CA',
        certificate: 'MIIB...',
        hasPrivateKey: true,
        passwordProtected: true,
        crls: ['MIIC...'],
        systemInstall: true,
        revoked: true,
      },
    ])
  })

  it('never exposes the private key value, only whether one is present', () => {
    const pki = { ca: { x: { private: { key: 'realprivatekeydata' } } } }
    const config = parsePKIConfig(pki)
    expect(config.cas[0].hasPrivateKey).toBe(true)
    expect(config.cas[0]).not.toHaveProperty('key')
    expect(config.cas[0]).not.toHaveProperty('privateKey')
  })

  it('normalizes a single crl value into a one-element array', () => {
    const pki = { ca: { x: { crl: 'MIIC...' } } }
    expect(parsePKIConfig(pki).cas[0].crls).toEqual(['MIIC...'])
  })

  it('sorts CAs by name', () => {
    const pki = { ca: { zeta: {}, alpha: {} } }
    expect(parsePKIConfig(pki).cas.map((c) => c.name)).toEqual(['alpha', 'zeta'])
  })
})

describe('parsePKIConfig - certificates', () => {
  it('parses a certificate with ACME settings', () => {
    const pki = {
      certificate: {
        vyos_cert: {
          certificate: 'MIIB...',
          private: { key: 'MIIE...' },
          acme: {
            'domain-name': ['vyos.example.com', 'www.vyos.example.com'],
            email: 'admin@example.com',
            'listen-address': '192.0.2.1',
            'rsa-key-size': '4096',
            url: 'https://acme-v02.api.letsencrypt.org/directory',
          },
        },
      },
    }
    const config = parsePKIConfig(pki)
    expect(config.certificates[0].acme).toEqual({
      domainNames: ['vyos.example.com', 'www.vyos.example.com'],
      email: 'admin@example.com',
      listenAddress: '192.0.2.1',
      rsaKeySize: '4096',
      url: 'https://acme-v02.api.letsencrypt.org/directory',
    })
  })

  it('returns blank ACME settings when not configured', () => {
    const pki = { certificate: { x: {} } }
    expect(parsePKIConfig(pki).certificates[0].acme).toEqual({ domainNames: [] })
  })

  it('parses revoked and password-protected flags', () => {
    const pki = { certificate: { x: { revoke: {}, private: { 'password-protected': {} } } } }
    const config = parsePKIConfig(pki)
    expect(config.certificates[0].revoked).toBe(true)
    expect(config.certificates[0].passwordProtected).toBe(true)
  })

  it('sorts certificates by name', () => {
    const pki = { certificate: { zeta: {}, alpha: {} } }
    expect(parsePKIConfig(pki).certificates.map((c) => c.name)).toEqual(['alpha', 'zeta'])
  })
})

describe('parsePKIConfig - DH params and key-pairs', () => {
  it('parses DH parameters', () => {
    const pki = { dh: { dh2048: { parameters: 'MIIB...' } } }
    expect(parsePKIConfig(pki).dhParams).toEqual([{ name: 'dh2048', parameters: 'MIIB...' }])
  })

  it('parses a key-pair, never exposing public or private key values', () => {
    const pki = {
      'key-pair': {
        wg0: {
          public: { key: 'publickeydata' },
          private: { key: 'privatekeydata', 'password-protected': {} },
        },
      },
    }
    const config = parsePKIConfig(pki)
    expect(config.keyPairs).toEqual([
      { name: 'wg0', hasPublicKey: true, hasPrivateKey: true, passwordProtected: true },
    ])
    expect(config.keyPairs[0]).not.toHaveProperty('publicKey')
    expect(config.keyPairs[0]).not.toHaveProperty('privateKey')
  })

  it('sorts DH params and key-pairs by name', () => {
    const pki = { dh: { zeta: {}, alpha: {} }, 'key-pair': { zeta: {}, alpha: {} } }
    const config = parsePKIConfig(pki)
    expect(config.dhParams.map((d) => d.name)).toEqual(['alpha', 'zeta'])
    expect(config.keyPairs.map((k) => k.name)).toEqual(['alpha', 'zeta'])
  })
})

describe('parsePKIConfig - x509 defaults', () => {
  it('parses default subject fields', () => {
    const pki = {
      x509: { default: { country: 'US', state: 'CA', locality: 'SF', organization: 'Acme' } },
    }
    expect(parsePKIConfig(pki).x509Defaults).toEqual({
      country: 'US',
      state: 'CA',
      locality: 'SF',
      organization: 'Acme',
    })
  })
})

describe('path builders', () => {
  it('builds a CA path', () => {
    expect(pkiCAPath('root', 'certificate')).toEqual(['pki', 'ca', 'root', 'certificate'])
  })

  it('builds a certificate path', () => {
    expect(pkiCertificatePath('vyos_cert', 'acme', 'email')).toEqual([
      'pki',
      'certificate',
      'vyos_cert',
      'acme',
      'email',
    ])
  })

  it('builds a DH path', () => {
    expect(pkiDHPath('dh2048', 'parameters')).toEqual(['pki', 'dh', 'dh2048', 'parameters'])
  })

  it('builds a key-pair path', () => {
    expect(pkiKeyPairPath('wg0', 'public', 'key')).toEqual(['pki', 'key-pair', 'wg0', 'public', 'key'])
  })

  it('builds the x509 defaults path', () => {
    expect(pkiX509DefaultsPath('country')).toEqual(['pki', 'x509', 'default', 'country'])
  })
})
