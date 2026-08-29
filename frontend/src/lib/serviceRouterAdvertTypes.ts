/**
 * Typed, UI-friendly shape for `service router-advert` (IPv6 SLAAC).
 * Confirmed against vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_router-advert.xml.in`).
 *
 * There's no separate enable/disable leaf - `router-advert.py` walks
 * `service router-advert interface`, so the mere presence of an
 * `interface <name>` tagNode instance turns RA on for that interface
 * with all leaf defaults applied. `no-send-advert` keeps the
 * interface's RA config present but suppresses actually transmitting
 * RAs (pre-staging, or advertising routes/prefixes without full RA
 * behavior) - it is NOT the same as "disabled".
 *
 * Deliberately excludes (still editable via Config Tree):
 * `nat64prefix` (NAT64 prefix advertisement), `auto-ignore` (wildcard
 * prefix exclusion), and `captive-portal` - all niche/advanced.
 */

export const RA_PREFERENCES = ['low', 'medium', 'high'] as const

export interface RouterAdvertPrefix {
  prefix: string
  noAutonomousFlag: boolean
  noOnLinkFlag: boolean
  deprecatePrefix: boolean
  decrementLifetime: boolean
  baseInterface?: string
  /** Numeric seconds or the literal string 'infinity'. Defaults to
   * '14400' in VyOS if unset. */
  preferredLifetime?: string
  /** Numeric seconds or the literal string 'infinity'. Defaults to
   * '2592000' in VyOS if unset. */
  validLifetime?: string
}

export interface RouterAdvertRoute {
  prefix: string
  /** Numeric seconds or the literal string 'infinity'. Defaults to
   * '1800' in VyOS if unset. */
  validLifetime?: string
  /** Defaults to 'medium' in VyOS if unset. */
  routePreference?: string
  noRemoveRoute: boolean
}

export interface RouterAdvertInterface {
  interfaceName: string
  /** Defaults to '64' in VyOS if unset. */
  hopLimit?: string
  defaultLifetime?: string
  /** Defaults to 'medium' in VyOS if unset. */
  defaultPreference?: string
  dnssl: string[]
  linkMtu?: string
  managedFlag: boolean
  /** Defaults to '600' in VyOS if unset. */
  intervalMax?: string
  intervalMin?: string
  nameServers: string[]
  nameServerLifetime?: string
  otherConfigFlag: boolean
  sourceAddresses: string[]
  /** Defaults to '0' in VyOS if unset. */
  reachableTime?: string
  /** Defaults to '0' in VyOS if unset. */
  retransTimer?: string
  noSendAdvert: boolean
  noSendInterval: boolean
  prefixes: RouterAdvertPrefix[]
  routes: RouterAdvertRoute[]
}

export function blankRouterAdvertInterface(): Omit<RouterAdvertInterface, 'interfaceName'> {
  return {
    dnssl: [],
    managedFlag: false,
    nameServers: [],
    otherConfigFlag: false,
    sourceAddresses: [],
    noSendAdvert: false,
    noSendInterval: false,
    prefixes: [],
    routes: [],
  }
}

export interface RouterAdvertConfig {
  interfaces: RouterAdvertInterface[]
}

export function blankRouterAdvertConfig(): RouterAdvertConfig {
  return { interfaces: [] }
}
