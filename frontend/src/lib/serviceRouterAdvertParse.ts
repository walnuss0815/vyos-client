import {
  blankRouterAdvertConfig,
  blankRouterAdvertInterface,
  type RouterAdvertConfig,
  type RouterAdvertInterface,
  type RouterAdvertPrefix,
  type RouterAdvertRoute,
} from './serviceRouterAdvertTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/containerParse.ts's
// own copy of this comment for why this matches the rest of the codebase.)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') return [v]
  return []
}

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

function parsePrefix(prefix: string, raw: unknown): RouterAdvertPrefix {
  return {
    prefix,
    noAutonomousFlag: isFlagPresent(raw, 'no-autonomous-flag'),
    noOnLinkFlag: isFlagPresent(raw, 'no-on-link-flag'),
    deprecatePrefix: isFlagPresent(raw, 'deprecate-prefix'),
    decrementLifetime: isFlagPresent(raw, 'decrement-lifetime'),
    baseInterface: asString(child(raw, 'base-interface')),
    preferredLifetime: asString(child(raw, 'preferred-lifetime')),
    validLifetime: asString(child(raw, 'valid-lifetime')),
  }
}

function parseRoute(prefix: string, raw: unknown): RouterAdvertRoute {
  return {
    prefix,
    validLifetime: asString(child(raw, 'valid-lifetime')),
    routePreference: asString(child(raw, 'route-preference')),
    noRemoveRoute: isFlagPresent(raw, 'no-remove-route'),
  }
}

function parseInterface(interfaceName: string, raw: unknown): RouterAdvertInterface {
  const intervalRoot = child(raw, 'interval')
  return {
    interfaceName,
    ...blankRouterAdvertInterface(),
    hopLimit: asString(child(raw, 'hop-limit')),
    defaultLifetime: asString(child(raw, 'default-lifetime')),
    defaultPreference: asString(child(raw, 'default-preference')),
    dnssl: asStringArray(child(raw, 'dnssl')),
    linkMtu: asString(child(raw, 'link-mtu')),
    managedFlag: isFlagPresent(raw, 'managed-flag'),
    intervalMax: asString(child(intervalRoot, 'max')),
    intervalMin: asString(child(intervalRoot, 'min')),
    nameServers: asStringArray(child(raw, 'name-server')),
    nameServerLifetime: asString(child(raw, 'name-server-lifetime')),
    otherConfigFlag: isFlagPresent(raw, 'other-config-flag'),
    sourceAddresses: asStringArray(child(raw, 'source-address')),
    reachableTime: asString(child(raw, 'reachable-time')),
    retransTimer: asString(child(raw, 'retrans-timer')),
    noSendAdvert: isFlagPresent(raw, 'no-send-advert'),
    noSendInterval: isFlagPresent(raw, 'no-send-interval'),
    prefixes: entries(child(raw, 'prefix'))
      .map(([prefix, prefixRaw]) => parsePrefix(prefix, prefixRaw))
      .sort((a, b) => a.prefix.localeCompare(b.prefix)),
    routes: entries(child(raw, 'route'))
      .map(([prefix, routeRaw]) => parseRoute(prefix, routeRaw))
      .sort((a, b) => a.prefix.localeCompare(b.prefix)),
  }
}

export function parseRouterAdvertConfig(routerAdvert: unknown): RouterAdvertConfig {
  if (routerAdvert === undefined) return blankRouterAdvertConfig()
  return {
    interfaces: entries(child(routerAdvert, 'interface'))
      .map(([name, raw]) => parseInterface(name, raw))
      .sort((a, b) => a.interfaceName.localeCompare(b.interfaceName)),
  }
}

// --- path builders -----------------------------------------------------

export function routerAdvertPath(...rest: string[]): string[] {
  return ['service', 'router-advert', ...rest]
}

export function routerAdvertInterfacePath(interfaceName: string, ...rest: string[]): string[] {
  return routerAdvertPath('interface', interfaceName, ...rest)
}

export function routerAdvertPrefixPath(interfaceName: string, prefix: string, ...rest: string[]): string[] {
  return routerAdvertInterfacePath(interfaceName, 'prefix', prefix, ...rest)
}

export function routerAdvertRoutePath(interfaceName: string, prefix: string, ...rest: string[]): string[] {
  return routerAdvertInterfacePath(interfaceName, 'route', prefix, ...rest)
}
