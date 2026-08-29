import { pkiX509DefaultsPath } from './pkiParse'
import type { PKIX509Defaults } from './pkiTypes'
import type { ConfigOp } from './vyosApi'

export interface PKIX509DefaultsFormValues {
  country: string
  state: string
  locality: string
  organization: string
}

export function blankX509DefaultsFormValues(): PKIX509DefaultsFormValues {
  return { country: '', state: '', locality: '', organization: '' }
}

export function x509DefaultsToFormValues(defaults: PKIX509Defaults): PKIX509DefaultsFormValues {
  return {
    country: defaults.country ?? '',
    state: defaults.state ?? '',
    locality: defaults.locality ?? '',
    organization: defaults.organization ?? '',
  }
}

interface ScalarField {
  get: (v: PKIX509DefaultsFormValues) => string
  segment: string
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.country, segment: 'country' },
  { get: (v) => v.state, segment: 'state' },
  { get: (v) => v.locality, segment: 'locality' },
  { get: (v) => v.organization, segment: 'organization' },
]

export function x509DefaultsFormToOps(
  before: PKIX509Defaults,
  values: PKIX509DefaultsFormValues,
): ConfigOp[] {
  const beforeValues = x509DefaultsToFormValues(before)
  const ops: ConfigOp[] = []
  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = pkiX509DefaultsPath(field.segment)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}
