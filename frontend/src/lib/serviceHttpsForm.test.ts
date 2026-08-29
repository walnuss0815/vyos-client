import { describe, expect, it } from 'vitest'
import {
  addHTTPSAPIKeyOp,
  blankHTTPSFormValues,
  disableHTTPSOp,
  enableHTTPSOp,
  httpsConfigToFormValues,
  httpsFormToOps,
  removeHTTPSAPIKeyOp,
} from './serviceHttpsForm'
import { blankHTTPSConfig } from './serviceHttpsTypes'

describe('httpsFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(httpsFormToOps(blankHTTPSConfig(), blankHTTPSFormValues())).toEqual([])
  })

  it('queues flag fields', () => {
    const values = blankHTTPSFormValues()
    values.restStrict = true
    values.enableHttpRedirect = true

    expect(httpsFormToOps(blankHTTPSConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'https', 'api', 'rest', 'strict'] },
      { op: 'set', path: ['service', 'https', 'enable-http-redirect'] },
    ])
  })

  it('queues scalar fields', () => {
    const values = blankHTTPSFormValues()
    values.port = '8443'
    values.certificate = 'my-cert'

    expect(httpsFormToOps(blankHTTPSConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'https', 'port'], value: '8443' },
      { op: 'set', path: ['service', 'https', 'certificates', 'certificate'], value: 'my-cert' },
    ])
  })

  it('queues a delete when a field is cleared', () => {
    const before = { ...blankHTTPSConfig(), port: '8443' }
    const values = httpsConfigToFormValues(before)
    values.port = ''

    expect(httpsFormToOps(before, values)).toEqual([
      { op: 'delete', path: ['service', 'https', 'port'] },
    ])
  })

  it('diffs tlsVersions as a set', () => {
    const before = { ...blankHTTPSConfig(), tlsVersions: ['1.2'] }
    const values = httpsConfigToFormValues(before)
    values.tlsVersions = ['1.3']

    expect(httpsFormToOps(before, values)).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['service', 'https', 'tls-version'], value: '1.3' },
        { op: 'delete', path: ['service', 'https', 'tls-version'], value: '1.2' },
      ]),
    )
  })
})

describe('enableHTTPSOp / disableHTTPSOp', () => {
  it('enables by setting the bare service node', () => {
    expect(enableHTTPSOp()).toEqual({ op: 'set', path: ['service', 'https'] })
  })

  it('disables by deleting the whole service node', () => {
    expect(disableHTTPSOp()).toEqual({ op: 'delete', path: ['service', 'https'] })
  })
})

describe('API key ops', () => {
  it('sets the key value on add', () => {
    expect(addHTTPSAPIKeyOp('my-key', 'plaintext-key-value')).toEqual({
      op: 'set',
      path: ['service', 'https', 'api', 'keys', 'id', 'my-key', 'key'],
      value: 'plaintext-key-value',
    })
  })

  it('deletes the whole id entry on remove', () => {
    expect(removeHTTPSAPIKeyOp('my-key')).toEqual({
      op: 'delete',
      path: ['service', 'https', 'api', 'keys', 'id', 'my-key'],
    })
  })
})
