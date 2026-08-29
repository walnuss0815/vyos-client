/**
 * Typed, UI-friendly shapes for `service ntp`. Confirmed against
 * vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_ntp.xml.in`, plus its shared
 * `#include`s).
 *
 * Deliberately excludes (still editable via Config Tree): the
 * `timestamp interface <if> receive-filter` node (NIC hardware
 * timestamping) and the `ptp` node (PTP transport port) - both niche,
 * hardware-dependent features.
 */

export interface NTPServer {
  address: string
  prefer: boolean
  pool: boolean
  noselect: boolean
  nts: boolean
  ptp: boolean
  interleave: boolean
}

export const NTP_LEAP_SECOND_MODES = ['ignore', 'smear', 'system', 'timezone'] as const

export interface NTPConfig {
  servers: NTPServer[]
  allowClientAddresses: string[]
  listenAddresses: string[]
  sourceAddresses: string[]
  /** `interface`/`source-interface`/`vrf` are all single-valued for
   * NTP (unlike SSH's multi-valued `vrf`). */
  interface?: string
  sourceInterface?: string
  vrf?: string
  /** Defaults to 'timezone' in VyOS if unset. */
  leapSecond?: string
  localStratum?: string
}

export function blankNTPConfig(): NTPConfig {
  return { servers: [], allowClientAddresses: [], listenAddresses: [], sourceAddresses: [] }
}
