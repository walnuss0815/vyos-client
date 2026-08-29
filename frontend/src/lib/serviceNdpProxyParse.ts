import {
  blankNDPProxyConfig,
  blankNDPProxyInterface,
  blankNDPProxyPrefix,
  type NDPProxyConfig,
  type NDPProxyInterface,
  type NDPProxyPrefix,
} from './serviceNdpProxyTypes'

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

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

function parsePrefix(prefix: string, raw: unknown): NDPProxyPrefix {
  return {
    prefix,
    ...blankNDPProxyPrefix(),
    disabled: isFlagPresent(raw, 'disable'),
    mode: asString(child(raw, 'mode')),
    interface: asString(child(raw, 'interface')),
  }
}

function parseInterface(interfaceName: string, raw: unknown): NDPProxyInterface {
  return {
    interfaceName,
    ...blankNDPProxyInterface(),
    disabled: isFlagPresent(raw, 'disable'),
    enableRouterBit: isFlagPresent(raw, 'enable-router-bit'),
    timeout: asString(child(raw, 'timeout')),
    ttl: asString(child(raw, 'ttl')),
    prefixes: entries(child(raw, 'prefix'))
      .map(([prefix, prefixRaw]) => parsePrefix(prefix, prefixRaw))
      .sort((a, b) => a.prefix.localeCompare(b.prefix)),
  }
}

export function parseNDPProxyConfig(ndpProxy: unknown): NDPProxyConfig {
  if (ndpProxy === undefined) return blankNDPProxyConfig()
  return {
    enabled: true,
    routeRefresh: asString(child(ndpProxy, 'route-refresh')),
    interfaces: entries(child(ndpProxy, 'interface'))
      .map(([name, raw]) => parseInterface(name, raw))
      .sort((a, b) => a.interfaceName.localeCompare(b.interfaceName)),
  }
}

// --- path builders -----------------------------------------------------

export function ndpProxyPath(...rest: string[]): string[] {
  return ['service', 'ndp-proxy', ...rest]
}

export function ndpProxyInterfacePath(interfaceName: string, ...rest: string[]): string[] {
  return ndpProxyPath('interface', interfaceName, ...rest)
}

export function ndpProxyPrefixPath(interfaceName: string, prefix: string, ...rest: string[]): string[] {
  return ndpProxyInterfacePath(interfaceName, 'prefix', prefix, ...rest)
}
