/**
 * Typed, UI-friendly shape for `service https`. Confirmed against
 * vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_https.xml.in`, plus its shared
 * `#include`s).
 *
 * Self-referential and worth calling out explicitly: this is
 * literally how vyos-client's own backend authenticates to VyOS's
 * REST API (`service https api keys id <id> key <key>`). Changing the
 * port, disabling the API, or removing the key this app itself uses
 * can lock this app out of managing VyOS entirely - commit-confirm
 * ("Safe apply") is the safety net, same as every other
 * self-referential risk in this app (disabling your own user,
 * revoking your own SSH key, ...).
 *
 * Deliberately excludes (still editable via Config Tree): `api rest
 * debug` (marked `<hidden/>` in VyOS's own schema - not user-facing).
 */

export interface HTTPSAPIKey {
  /** The tagNode identifier - an arbitrary user-chosen name for this
   * key, VyOS doesn't require any particular format. */
  id: string
  /** Write-only, like every other masked credential in this app - see
   * SystemUser.hasPassword's doc comment for the general convention.
   * `key` matches shared/sensitive-fields.json's generic "key" entry. */
  hasKey: boolean
}

export const HTTPS_GRAPHQL_AUTH_TYPES = ['key', 'token'] as const

export const HTTPS_TLS_VERSIONS = ['1.2', '1.3'] as const

export interface HTTPSConfig {
  /** Whether `service https` exists at all in the tree. */
  enabled: boolean
  apiKeys: HTTPSAPIKey[]
  restStrict: boolean
  graphqlIntrospection: boolean
  /** Defaults to 'key' in VyOS if unset. */
  graphqlAuthType?: string
  /** Defaults to '3600' in VyOS if unset. */
  graphqlExpiration?: string
  /** Defaults to '32' in VyOS if unset. */
  graphqlSecretLength?: string
  graphqlCorsAllowOrigins: string[]
  allowClientAddresses: string[]
  enableHttpRedirect: boolean
  listenAddresses: string[]
  /** Defaults to '443' in VyOS if unset. */
  port?: string
  /** Defaults to '1' in VyOS if unset. */
  requestBodySizeLimit?: string
  /** References an existing `pki ca` entry by name. */
  caCertificate?: string
  /** References an existing `pki certificate` entry by name. */
  certificate?: string
  /** References an existing `pki dh` entry by name. */
  dhParams?: string
  /** Defaults to both '1.2' and '1.3' in VyOS if unset. */
  tlsVersions: string[]
  vrf?: string
}

export function blankHTTPSConfig(): HTTPSConfig {
  return {
    enabled: false,
    apiKeys: [],
    restStrict: false,
    graphqlIntrospection: false,
    graphqlCorsAllowOrigins: [],
    allowClientAddresses: [],
    enableHttpRedirect: false,
    listenAddresses: [],
    tlsVersions: [],
  }
}
