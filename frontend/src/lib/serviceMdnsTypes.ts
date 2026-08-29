/**
 * Typed, UI-friendly shape for `service mdns repeater`. Confirmed
 * against vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_mdns_repeater.xml.in`). Full
 * coverage - small area.
 *
 * Note the tree shape: `service mdns repeater` - two intermediate
 * nodes (`mdns`, `repeater`), not one flat `service mdns-repeater`.
 */

export const MDNS_IP_VERSIONS = ['ipv4', 'ipv6', 'both'] as const

export interface MdnsRepeaterConfig {
  /** Whether `service mdns repeater` exists at all in the tree. */
  enabled: boolean
  disabled: boolean
  interfaces: string[]
  /** Defaults to 'both' in VyOS if unset. */
  ipVersion?: string
  browseDomains: string[]
  allowServices: string[]
  /** Defaults to '4096' in VyOS if unset. */
  cacheEntries?: string
  vrrpDisable: boolean
}

export function blankMdnsRepeaterConfig(): MdnsRepeaterConfig {
  return {
    enabled: false,
    disabled: false,
    interfaces: [],
    browseDomains: [],
    allowServices: [],
    vrrpDisable: false,
  }
}
