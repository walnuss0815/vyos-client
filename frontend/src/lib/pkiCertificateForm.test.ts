import { describe, expect, it } from 'vitest'
import {
  blankCertificateFormValues,
  certificateFormToOps,
  certificateToFormValues,
  deleteCertificateOp,
} from './pkiCertificateForm'
import type { PKICertificate } from './pkiTypes'

function emptyCertificate(overrides: Partial<PKICertificate> = {}): PKICertificate {
  return {
    name: 'vyos_cert',
    hasPrivateKey: false,
    passwordProtected: false,
    revoked: false,
    acme: { domainNames: [] },
    ...overrides,
  }
}

describe('certificateFormToOps - creating a new certificate', () => {
  it('queues nothing for a blank form', () => {
    expect(certificateFormToOps('vyos_cert', undefined, blankCertificateFormValues())).toEqual([])
  })

  it('queues certificate, private key, and ACME fields', () => {
    const values = blankCertificateFormValues()
    values.certificate = 'MIIB...'
    values.privateKey = 'MIIE...'
    values.acmeEmail = 'admin@example.com'
    values.acmeRsaKeySize = '4096'

    const ops = certificateFormToOps('vyos_cert', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['pki', 'certificate', 'vyos_cert', 'certificate'], value: 'MIIB...' },
        { op: 'set', path: ['pki', 'certificate', 'vyos_cert', 'private', 'key'], value: 'MIIE...' },
        {
          op: 'set',
          path: ['pki', 'certificate', 'vyos_cert', 'acme', 'email'],
          value: 'admin@example.com',
        },
        { op: 'set', path: ['pki', 'certificate', 'vyos_cert', 'acme', 'rsa-key-size'], value: '4096' },
      ]),
    )
  })

  it('queues revoked and password-protected flags', () => {
    const values = blankCertificateFormValues()
    values.revoked = true
    values.passwordProtected = true

    const ops = certificateFormToOps('vyos_cert', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['pki', 'certificate', 'vyos_cert', 'revoke'] },
        { op: 'set', path: ['pki', 'certificate', 'vyos_cert', 'private', 'password-protected'] },
      ]),
    )
  })
})

describe('certificateFormToOps - editing an existing certificate', () => {
  it('queues nothing when unchanged', () => {
    const cert = emptyCertificate({ certificate: 'MIIB...' })
    expect(certificateFormToOps('vyos_cert', cert, certificateToFormValues(cert))).toEqual([])
  })

  it('always queues a fresh private key when typed, regardless of hasPrivateKey', () => {
    const cert = emptyCertificate({ hasPrivateKey: true })
    const values = certificateToFormValues(cert)
    values.privateKey = 'new-key-data'

    expect(certificateFormToOps('vyos_cert', cert, values)).toEqual([
      { op: 'set', path: ['pki', 'certificate', 'vyos_cert', 'private', 'key'], value: 'new-key-data' },
    ])
  })

  it('queues a delete when an ACME field is cleared', () => {
    const cert = emptyCertificate({ acme: { domainNames: [], email: 'old@example.com' } })
    const values = certificateToFormValues(cert)
    values.acmeEmail = ''

    expect(certificateFormToOps('vyos_cert', cert, values)).toEqual([
      { op: 'delete', path: ['pki', 'certificate', 'vyos_cert', 'acme', 'email'] },
    ])
  })
})

describe('deleteCertificateOp', () => {
  it('builds a delete op for the whole certificate', () => {
    expect(deleteCertificateOp('vyos_cert')).toEqual({
      op: 'delete',
      path: ['pki', 'certificate', 'vyos_cert'],
    })
  })
})
