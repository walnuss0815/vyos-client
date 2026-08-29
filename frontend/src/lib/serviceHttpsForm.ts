import {
  httpsApiKeyPath,
  httpsCertificatesPath,
  httpsGraphqlAuthPath,
  httpsPath,
} from './serviceHttpsParse'
import type { HTTPSConfig } from './serviceHttpsTypes'
import type { ConfigOp } from './vyosApi'

export interface HTTPSFormValues {
  restStrict: boolean
  graphqlIntrospection: boolean
  enableHttpRedirect: boolean
  graphqlAuthType: string
  graphqlExpiration: string
  graphqlSecretLength: string
  port: string
  requestBodySizeLimit: string
  caCertificate: string
  certificate: string
  dhParams: string
  vrf: string
  tlsVersions: string[]
}

export function blankHTTPSFormValues(): HTTPSFormValues {
  return {
    restStrict: false,
    graphqlIntrospection: false,
    enableHttpRedirect: false,
    graphqlAuthType: '',
    graphqlExpiration: '',
    graphqlSecretLength: '',
    port: '',
    requestBodySizeLimit: '',
    caCertificate: '',
    certificate: '',
    dhParams: '',
    vrf: '',
    tlsVersions: [],
  }
}

export function httpsConfigToFormValues(config: HTTPSConfig): HTTPSFormValues {
  return {
    restStrict: config.restStrict,
    graphqlIntrospection: config.graphqlIntrospection,
    enableHttpRedirect: config.enableHttpRedirect,
    graphqlAuthType: config.graphqlAuthType ?? '',
    graphqlExpiration: config.graphqlExpiration ?? '',
    graphqlSecretLength: config.graphqlSecretLength ?? '',
    port: config.port ?? '',
    requestBodySizeLimit: config.requestBodySizeLimit ?? '',
    caCertificate: config.caCertificate ?? '',
    certificate: config.certificate ?? '',
    dhParams: config.dhParams ?? '',
    vrf: config.vrf ?? '',
    tlsVersions: config.tlsVersions,
  }
}

interface FlagField {
  get: (v: HTTPSFormValues) => boolean
  path: string[]
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.restStrict, path: httpsPath('api', 'rest', 'strict') },
  { get: (v) => v.graphqlIntrospection, path: httpsPath('api', 'graphql', 'introspection') },
  { get: (v) => v.enableHttpRedirect, path: httpsPath('enable-http-redirect') },
]

interface ScalarField {
  get: (v: HTTPSFormValues) => string
  path: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.graphqlAuthType, path: httpsGraphqlAuthPath('type') },
  { get: (v) => v.graphqlExpiration, path: httpsGraphqlAuthPath('expiration') },
  { get: (v) => v.graphqlSecretLength, path: httpsGraphqlAuthPath('secret-length') },
  { get: (v) => v.port, path: httpsPath('port') },
  { get: (v) => v.requestBodySizeLimit, path: httpsPath('request-body-size-limit') },
  { get: (v) => v.caCertificate, path: httpsCertificatesPath('ca-certificate') },
  { get: (v) => v.certificate, path: httpsCertificatesPath('certificate') },
  { get: (v) => v.dhParams, path: httpsCertificatesPath('dh-params') },
  { get: (v) => v.vrf, path: httpsPath('vrf') },
]

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. `tlsVersions` (a fixed
 * 2-value enum) is diffed as a set, same convention as
 * containerForm.ts's `capabilities` diffing. */
export function httpsFormToOps(before: HTTPSConfig, values: HTTPSFormValues): ConfigOp[] {
  const beforeValues = httpsConfigToFormValues(before)
  const ops: ConfigOp[] = []

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    ops.push(newValue ? { op: 'set', path: field.path } : { op: 'delete', path: field.path })
  }

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    if (newValue.trim() === '') ops.push({ op: 'delete', path: field.path })
    else ops.push({ op: 'set', path: field.path, value: newValue.trim() })
  }

  const oldVersions = new Set(beforeValues.tlsVersions)
  const newVersions = new Set(values.tlsVersions)
  const tlsVersionPath = httpsPath('tls-version')
  for (const version of newVersions) {
    if (!oldVersions.has(version)) ops.push({ op: 'set', path: tlsVersionPath, value: version })
  }
  for (const version of oldVersions) {
    if (!newVersions.has(version)) ops.push({ op: 'delete', path: tlsVersionPath, value: version })
  }

  return ops
}

/** Enables the HTTPS API by creating the (otherwise-empty) `service
 * https` node - VyOS applies every leaf default once this exists. */
export function enableHTTPSOp(): ConfigOp {
  return { op: 'set', path: httpsPath() }
}

/** Disables the HTTPS API entirely - see this file's HTTPSConfig doc
 * comment for why this is self-referentially risky for this app. */
export function disableHTTPSOp(): ConfigOp {
  return { op: 'delete', path: httpsPath() }
}

export function addHTTPSAPIKeyOp(id: string, key: string): ConfigOp {
  return { op: 'set', path: [...httpsApiKeyPath(id), 'key'], value: key }
}

export function removeHTTPSAPIKeyOp(id: string): ConfigOp {
  return { op: 'delete', path: httpsApiKeyPath(id) }
}
