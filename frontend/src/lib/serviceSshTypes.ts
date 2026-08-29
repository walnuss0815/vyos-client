/**
 * Typed, UI-friendly shape for `service ssh`. Confirmed against
 * vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_ssh.xml.in`, plus its shared
 * `#include`s).
 *
 * Deliberately excludes (still editable via Config Tree): `fido
 * pin-required`/`touch-required` are included (small, simple flags),
 * but the algorithm allow-lists (`cipher`, `hostkey-algorithm`,
 * `pubkey-accepted-algorithm`, `key-exchange`, `mac`) are modeled as
 * free-text ChipLists rather than fixed checkbox groups (unlike
 * Container's 11-value `capability` enum) - each has 10-19 possible
 * values, too many for a comfortable checkbox group, and VyOS's own
 * regex constraint will reject an invalid entry at commit time either
 * way.
 *
 * Note: unlike every other area's `vrf` (single-valued), SSH's `vrf`
 * is genuinely multi-valued in VyOS (`include/vrf-multi.xml.i`,
 * confirmed via XML) - modeled here as a string array, not a single
 * optional string.
 */

export const SSH_LOG_LEVELS = ['quiet', 'fatal', 'error', 'info', 'verbose'] as const

export interface SSHConfig {
  /** Whether `service ssh` exists at all in the tree - VyOS enables
   * the daemon simply by the node's presence, with all leaf defaults
   * applied if nothing else is set. */
  enabled: boolean
  allowGroups: string[]
  allowUsers: string[]
  denyGroups: string[]
  denyUsers: string[]
  ciphers: string[]
  hostkeyAlgorithms: string[]
  pubkeyAcceptedAlgorithms: string[]
  keyExchangeAlgorithms: string[]
  macAlgorithms: string[]
  disableHostValidation: boolean
  disablePasswordAuthentication: boolean
  fidoPinRequired: boolean
  fidoTouchRequired: boolean
  /** Defaults to '120' in VyOS if unset. */
  dynamicProtectionBlockTime?: string
  /** Defaults to '1800' in VyOS if unset. */
  dynamicProtectionDetectTime?: string
  /** Defaults to '30' in VyOS if unset. */
  dynamicProtectionThreshold?: string
  dynamicProtectionAllowFrom: string[]
  listenAddresses: string[]
  /** Defaults to 'info' in VyOS if unset. */
  loglevel?: string
  /** Defaults to ['22'] in VyOS if unset. */
  ports: string[]
  rekeyData?: string
  rekeyTime?: string
  clientKeepaliveInterval?: string
  trustedUserCA?: string
  /** Defaults to ['default'] in VyOS if unset. */
  vrfs: string[]
}

export function blankSSHConfig(): SSHConfig {
  return {
    enabled: false,
    allowGroups: [],
    allowUsers: [],
    denyGroups: [],
    denyUsers: [],
    ciphers: [],
    hostkeyAlgorithms: [],
    pubkeyAcceptedAlgorithms: [],
    keyExchangeAlgorithms: [],
    macAlgorithms: [],
    disableHostValidation: false,
    disablePasswordAuthentication: false,
    fidoPinRequired: false,
    fidoTouchRequired: false,
    dynamicProtectionAllowFrom: [],
    listenAddresses: [],
    ports: [],
    vrfs: [],
  }
}
