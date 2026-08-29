/**
 * Typed, UI-friendly shape for `service tftp-server`. Confirmed
 * against vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_tftp-server.xml.in`). Full
 * coverage - this area is small enough not to need curation.
 *
 * Note: `listen-address` here is a *tagNode* keyed by IP (via the
 * `listen-address-vrf.xml.i` include), each with its own optional
 * `vrf` child - not the plain multi-valued leaf every other area's
 * `listen-address` is (that's the generic `listen-address.xml.i`
 * include instead). Don't assume a shared shape across areas.
 */

export interface TFTPListenAddress {
  address: string
  vrf?: string
}

export interface TFTPServerConfig {
  /** Whether `service tftp-server` exists at all in the tree. */
  enabled: boolean
  directory?: string
  allowUpload: boolean
  /** Defaults to '69' in VyOS if unset. */
  port?: string
  listenAddresses: TFTPListenAddress[]
}

export function blankTFTPServerConfig(): TFTPServerConfig {
  return { enabled: false, allowUpload: false, listenAddresses: [] }
}
