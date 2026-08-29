import { describe, expect, it } from 'vitest'
import { blankCAFormValues, caFormToOps, caToFormValues, deleteCAOp } from './pkiCAForm'
import type { PKICertificateAuthority } from './pkiTypes'

function emptyCA(overrides: Partial<PKICertificateAuthority> = {}): PKICertificateAuthority {
  return {
    name: 'root',
    hasPrivateKey: false,
    passwordProtected: false,
    crls: [],
    systemInstall: false,
    revoked: false,
    ...overrides,
  }
}

describe('caFormToOps - creating a new CA', () => {
  it('queues nothing for a blank form', () => {
    expect(caFormToOps('root', undefined, blankCAFormValues())).toEqual([])
  })

  it('queues certificate, description, and private key', () => {
    const values = blankCAFormValues()
    values.certificate = 'MIIB...'
    values.description = 'Root CA'
    values.privateKey = 'MIIE...'

    const ops = caFormToOps('root', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['pki', 'ca', 'root', 'description'], value: 'Root CA' },
      { op: 'set', path: ['pki', 'ca', 'root', 'certificate'], value: 'MIIB...' },
      { op: 'set', path: ['pki', 'ca', 'root', 'private', 'key'], value: 'MIIE...' },
    ])
  })

  it('queues flags', () => {
    const values = blankCAFormValues()
    values.passwordProtected = true
    values.systemInstall = true
    values.revoked = true

    const ops = caFormToOps('root', undefined, values)

    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['pki', 'ca', 'root', 'private', 'password-protected'] },
        { op: 'set', path: ['pki', 'ca', 'root', 'system-install'] },
        { op: 'set', path: ['pki', 'ca', 'root', 'revoke'] },
      ]),
    )
  })
})

describe('caFormToOps - editing an existing CA', () => {
  it('queues nothing when unchanged', () => {
    const ca = emptyCA({ description: 'x' })
    expect(caFormToOps('root', ca, caToFormValues(ca))).toEqual([])
  })

  // Regression test: this used to check the raw (untrimmed) value, so
  // whitespace-only input queued a `set` with a literal whitespace
  // value instead of being treated the same as actually clearing the
  // field.
  it('treats a whitespace-only description the same as clearing it', () => {
    const ca = emptyCA({ description: 'x' })
    const values = caToFormValues(ca)
    values.description = '   '

    expect(caFormToOps('root', ca, values)).toEqual([
      { op: 'delete', path: ['pki', 'ca', 'root', 'description'] },
    ])
  })

  it('always queues a fresh private key when typed, regardless of hasPrivateKey', () => {
    const ca = emptyCA({ hasPrivateKey: true })
    const values = caToFormValues(ca)
    values.privateKey = 'new-key-data'

    expect(caFormToOps('root', ca, values)).toEqual([
      { op: 'set', path: ['pki', 'ca', 'root', 'private', 'key'], value: 'new-key-data' },
    ])
  })

  it('never queues anything for the private key when left blank', () => {
    const ca = emptyCA({ hasPrivateKey: true })
    expect(caFormToOps('root', ca, caToFormValues(ca))).toEqual([])
  })

  it('queues a delete when certificate is cleared', () => {
    const ca = emptyCA({ certificate: 'MIIB...' })
    const values = caToFormValues(ca)
    values.certificate = ''

    expect(caFormToOps('root', ca, values)).toEqual([
      { op: 'delete', path: ['pki', 'ca', 'root', 'certificate'] },
    ])
  })

  it('queues a flag delete when revoked is unchecked', () => {
    const ca = emptyCA({ revoked: true })
    const values = caToFormValues(ca)
    values.revoked = false

    expect(caFormToOps('root', ca, values)).toEqual([
      { op: 'delete', path: ['pki', 'ca', 'root', 'revoke'] },
    ])
  })
})

describe('deleteCAOp', () => {
  it('builds a delete op for the whole CA', () => {
    expect(deleteCAOp('root')).toEqual({ op: 'delete', path: ['pki', 'ca', 'root'] })
  })
})
