/**
 * Typed, UI-friendly shape for `service dns dynamic`. Confirmed
 * against vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_dns_dynamic.xml.in`). Full coverage
 * - this area is small enough not to need curation.
 *
 * `protocol` has no fixed enum in VyOS's own schema (it's validated by
 * an external `ddclient-protocol` validator against a dynamically
 * generated list, e.g. `cloudflare`, `dyndns2`, `duckdns`, ...) - kept
 * as free text here, not a `<select>`.
 *
 * `address` is a VyOS *node* with two alternative children
 * (`interface` - obtain the IP from a local interface - or `web.url`/
 * `web.skip` - query an external "what's my IP" service) that aren't
 * schema-enforced as mutually exclusive, but are semantically a
 * one-of-two choice in practice (ddclient only uses one method).
 * Modeled here as an explicit `addressMode` discriminator, presented
 * as a radio choice in the UI even though VyOS's own schema doesn't
 * enforce it.
 */

export const DYNAMIC_DNS_IP_VERSIONS = ['ipv4', 'ipv6', 'both'] as const

export interface DynamicDNSEntry {
  name: string
  description?: string
  protocol?: string
  /** undefined = neither configured yet. */
  addressMode?: 'interface' | 'web'
  addressInterface?: string
  addressWebUrl?: string
  addressWebSkip?: string
  /** Defaults to 'ipv4' in VyOS if unset. */
  ipVersion?: string
  hostNames: string[]
  server?: string
  zone?: string
  username?: string
  /** Write-only, like every other masked credential in this app - see
   * SystemUser.hasPassword's doc comment for the general convention. */
  hasPassword: boolean
  /** TSIG key *file path* (for RFC2136 nsupdate-style updates), not
   * key material itself - not masked (it's a path, not a secret). */
  key?: string
  ttl?: string
  waitTime?: string
  expiryTime?: string
}

export function blankDynamicDNSEntry(): Omit<DynamicDNSEntry, 'name'> {
  return { hostNames: [], hasPassword: false }
}

export interface DynamicDNSConfig {
  entries: DynamicDNSEntry[]
  /** Defaults to '300' in VyOS if unset. */
  interval?: string
  vrf?: string
}

export function blankDynamicDNSConfig(): DynamicDNSConfig {
  return { entries: [] }
}
