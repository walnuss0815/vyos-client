import { blankHTTPSConfig, type HTTPSAPIKey, type HTTPSConfig } from './serviceHttpsTypes'
import { isRecord, asString, asStringArray, child, isFlagPresent } from './configTree'

function parseAPIKeys(https: unknown): HTTPSAPIKey[] {
  const root = child(child(https, 'api'), 'keys')
  const idRoot = child(root, 'id')
  if (!isRecord(idRoot)) return []
  return Object.entries(idRoot)
    .map(([id, raw]): HTTPSAPIKey => ({ id, hasKey: child(raw, 'key') !== undefined }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function parseHTTPSConfig(https: unknown): HTTPSConfig {
  if (https === undefined) return blankHTTPSConfig()
  const api = child(https, 'api')
  const graphql = child(api, 'graphql')
  const graphqlAuth = child(graphql, 'authentication')
  const certificates = child(https, 'certificates')

  return {
    enabled: true,
    apiKeys: parseAPIKeys(https),
    restStrict: isFlagPresent(child(api, 'rest'), 'strict'),
    graphqlIntrospection: isFlagPresent(graphql, 'introspection'),
    graphqlAuthType: asString(child(graphqlAuth, 'type')),
    graphqlExpiration: asString(child(graphqlAuth, 'expiration')),
    graphqlSecretLength: asString(child(graphqlAuth, 'secret-length')),
    graphqlCorsAllowOrigins: asStringArray(child(child(graphql, 'cors'), 'allow-origin')),
    allowClientAddresses: asStringArray(child(child(https, 'allow-client'), 'address')),
    enableHttpRedirect: isFlagPresent(https, 'enable-http-redirect'),
    listenAddresses: asStringArray(child(https, 'listen-address')),
    port: asString(child(https, 'port')),
    requestBodySizeLimit: asString(child(https, 'request-body-size-limit')),
    caCertificate: asString(child(certificates, 'ca-certificate')),
    certificate: asString(child(certificates, 'certificate')),
    dhParams: asString(child(certificates, 'dh-params')),
    tlsVersions: asStringArray(child(https, 'tls-version')),
    vrf: asString(child(https, 'vrf')),
  }
}

// --- path builders -----------------------------------------------------

export function httpsPath(...rest: string[]): string[] {
  return ['service', 'https', ...rest]
}

export function httpsApiKeyPath(id: string, ...rest: string[]): string[] {
  return httpsPath('api', 'keys', 'id', id, ...rest)
}

export function httpsGraphqlAuthPath(...rest: string[]): string[] {
  return httpsPath('api', 'graphql', 'authentication', ...rest)
}

export function httpsGraphqlCorsPath(...rest: string[]): string[] {
  return httpsPath('api', 'graphql', 'cors', ...rest)
}

export function httpsAllowClientPath(...rest: string[]): string[] {
  return httpsPath('allow-client', ...rest)
}

export function httpsCertificatesPath(...rest: string[]): string[] {
  return httpsPath('certificates', ...rest)
}
