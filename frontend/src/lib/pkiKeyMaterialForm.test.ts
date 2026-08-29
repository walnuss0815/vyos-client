import { describe, expect, it } from 'vitest'
import {
  blankDHFormValues,
  blankKeyPairFormValues,
  deleteDHOp,
  deleteKeyPairOp,
  dhFormToOps,
  dhToFormValues,
  keyPairFormToOps,
  keyPairToFormValues,
} from './pkiKeyMaterialForm'
import type { PKIDHParams, PKIKeyPair } from './pkiTypes'

function emptyKeyPair(overrides: Partial<PKIKeyPair> = {}): PKIKeyPair {
  return { name: 'wg0', hasPublicKey: false, hasPrivateKey: false, passwordProtected: false, ...overrides }
}

function emptyDH(overrides: Partial<PKIDHParams> = {}): PKIDHParams {
  return { name: 'dh2048', ...overrides }
}

describe('keyPairFormToOps - creating a new key-pair', () => {
  it('queues nothing for a blank form', () => {
    expect(keyPairFormToOps('wg0', undefined, blankKeyPairFormValues())).toEqual([])
  })

  it('queues public key, private key, and password-protected', () => {
    const values = blankKeyPairFormValues()
    values.publicKey = 'publickeydata'
    values.privateKey = 'privatekeydata'
    values.passwordProtected = true

    const ops = keyPairFormToOps('wg0', undefined, values)

    expect(ops).toEqual([
      { op: 'set', path: ['pki', 'key-pair', 'wg0', 'private', 'password-protected'] },
      { op: 'set', path: ['pki', 'key-pair', 'wg0', 'public', 'key'], value: 'publickeydata' },
      { op: 'set', path: ['pki', 'key-pair', 'wg0', 'private', 'key'], value: 'privatekeydata' },
    ])
  })
})

describe('keyPairFormToOps - editing an existing key-pair', () => {
  it('always queues fresh keys when typed, regardless of hasPublicKey/hasPrivateKey', () => {
    const keyPair = emptyKeyPair({ hasPublicKey: true, hasPrivateKey: true })
    const values = keyPairToFormValues(keyPair)
    values.publicKey = 'new-public'
    values.privateKey = 'new-private'

    const ops = keyPairFormToOps('wg0', keyPair, values)

    expect(ops).toEqual([
      { op: 'set', path: ['pki', 'key-pair', 'wg0', 'public', 'key'], value: 'new-public' },
      { op: 'set', path: ['pki', 'key-pair', 'wg0', 'private', 'key'], value: 'new-private' },
    ])
  })

  it('queues nothing when left blank', () => {
    const keyPair = emptyKeyPair({ hasPublicKey: true, hasPrivateKey: true })
    expect(keyPairFormToOps('wg0', keyPair, keyPairToFormValues(keyPair))).toEqual([])
  })
})

describe('deleteKeyPairOp', () => {
  it('builds a delete op for the whole key-pair', () => {
    expect(deleteKeyPairOp('wg0')).toEqual({ op: 'delete', path: ['pki', 'key-pair', 'wg0'] })
  })
})

describe('dhFormToOps', () => {
  it('queues nothing for a blank form', () => {
    expect(dhFormToOps('dh2048', undefined, blankDHFormValues())).toEqual([])
  })

  it('queues parameters on creation', () => {
    const values = blankDHFormValues()
    values.parameters = 'MIIB...'
    expect(dhFormToOps('dh2048', undefined, values)).toEqual([
      { op: 'set', path: ['pki', 'dh', 'dh2048', 'parameters'], value: 'MIIB...' },
    ])
  })

  it('queues nothing when unchanged', () => {
    const dh = emptyDH({ parameters: 'MIIB...' })
    expect(dhFormToOps('dh2048', dh, dhToFormValues(dh))).toEqual([])
  })

  it('queues a delete when cleared', () => {
    const dh = emptyDH({ parameters: 'MIIB...' })
    const values = dhToFormValues(dh)
    values.parameters = ''
    expect(dhFormToOps('dh2048', dh, values)).toEqual([
      { op: 'delete', path: ['pki', 'dh', 'dh2048', 'parameters'] },
    ])
  })
})

describe('deleteDHOp', () => {
  it('builds a delete op for the whole DH entry', () => {
    expect(deleteDHOp('dh2048')).toEqual({ op: 'delete', path: ['pki', 'dh', 'dh2048'] })
  })
})
