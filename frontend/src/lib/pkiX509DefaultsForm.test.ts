import { describe, expect, it } from 'vitest'
import {
  blankX509DefaultsFormValues,
  x509DefaultsFormToOps,
  x509DefaultsToFormValues,
} from './pkiX509DefaultsForm'
import { blankX509Defaults } from './pkiTypes'

describe('x509DefaultsToFormValues / x509DefaultsFormToOps', () => {
  it('normalizes undefined fields to blank', () => {
    expect(x509DefaultsToFormValues(blankX509Defaults())).toEqual(blankX509DefaultsFormValues())
  })

  it('queues nothing when unchanged', () => {
    const defaults = { ...blankX509Defaults(), country: 'US' }
    expect(x509DefaultsFormToOps(defaults, x509DefaultsToFormValues(defaults))).toEqual([])
  })

  it('queues a set for a changed field', () => {
    const defaults = blankX509Defaults()
    const values = x509DefaultsToFormValues(defaults)
    values.organization = 'Acme'

    expect(x509DefaultsFormToOps(defaults, values)).toEqual([
      { op: 'set', path: ['pki', 'x509', 'default', 'organization'], value: 'Acme' },
    ])
  })

  it('queues a delete for a cleared field', () => {
    const defaults = { ...blankX509Defaults(), locality: 'SF' }
    const values = x509DefaultsToFormValues(defaults)
    values.locality = ''

    expect(x509DefaultsFormToOps(defaults, values)).toEqual([
      { op: 'delete', path: ['pki', 'x509', 'default', 'locality'] },
    ])
  })
})
