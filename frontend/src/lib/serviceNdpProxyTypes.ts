/**
 * Typed, UI-friendly shape for `service ndp-proxy`. Confirmed against
 * vyos-1x's own interface-definition XML source
 * (`interface-definitions/service_ndp-proxy.xml.in`). Full coverage -
 * small area.
 *
 * NDP proxy config is per-listener-interface (`interface <name>`),
 * each with its own list of proxied `prefix <addr>` entries. Note:
 * `prefix`'s tag value accepts either a bare IPv6 address or a CIDR
 * prefix (two alternative validators in VyOS's own schema) - not
 * restricted to one form.
 */

export const NDP_PROXY_MODES = ['static', 'auto', 'interface'] as const

export interface NDPProxyPrefix {
  prefix: string
  disabled: boolean
  /** Defaults to 'static' in VyOS if unset. */
  mode?: string
  /** Only meaningful when mode is 'interface' - not enforced by VyOS's
   * own schema, just a UI convention. */
  interface?: string
}

export function blankNDPProxyPrefix(): Omit<NDPProxyPrefix, 'prefix'> {
  return { disabled: false }
}

export interface NDPProxyInterface {
  interfaceName: string
  disabled: boolean
  enableRouterBit: boolean
  /** Milliseconds. Defaults to '500' in VyOS if unset. */
  timeout?: string
  /** Milliseconds. Defaults to '30000' in VyOS if unset. */
  ttl?: string
  prefixes: NDPProxyPrefix[]
}

export function blankNDPProxyInterface(): Omit<NDPProxyInterface, 'interfaceName'> {
  return { disabled: false, enableRouterBit: false, prefixes: [] }
}

export interface NDPProxyConfig {
  /** Whether `service ndp-proxy` exists at all in the tree. */
  enabled: boolean
  /** Milliseconds. Defaults to '30000' in VyOS if unset. */
  routeRefresh?: string
  interfaces: NDPProxyInterface[]
}

export function blankNDPProxyConfig(): NDPProxyConfig {
  return { enabled: false, interfaces: [] }
}
