import {
  type RouteFamily,
  type StaticRoute,
  type StaticRouteInterface,
  type StaticRouteNextHop,
  type StaticRouteRejectOrBlackhole,
} from './routingTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared, matching firewallParse.ts/
// dhcpConfigParse.ts/interfaceParse.ts's existing precedent of keeping
// each parse module self-contained.)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asArray(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (Array.isArray(v)) return v.map(String)
  return [String(v)]
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

// --- static routes -----------------------------------------------------

/** The VyOS config-tree node name for each family's static routes -
 * `route` for IPv4, `route6` for IPv6 (not a shared `route` node with
 * a family discriminator field). */
function chainName(family: RouteFamily): string {
  return family === 'ipv6' ? 'route6' : 'route'
}

function parseNextHops(raw: unknown): StaticRouteNextHop[] {
  const root = child(raw, 'next-hop')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([address, r]) => ({
      address,
      disabled: isFlagPresent(r, 'disable'),
      distance: asString(child(r, 'distance')),
    }))
    .sort((a, b) => a.address.localeCompare(b.address))
}

function parseInterfaces(raw: unknown): StaticRouteInterface[] {
  const root = child(raw, 'interface')
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([interfaceName, r]) => ({
      interfaceName,
      disabled: isFlagPresent(r, 'disable'),
      distance: asString(child(r, 'distance')),
    }))
    .sort((a, b) => a.interfaceName.localeCompare(b.interfaceName))
}

function parseRejectOrBlackhole(raw: unknown): StaticRouteRejectOrBlackhole | undefined {
  if (!isRecord(raw)) return undefined
  return {
    distance: asString(child(raw, 'distance')),
    tag: asString(child(raw, 'tag')),
  }
}

/** Parses every destination under `protocols static route` (ipv4) and
 * `protocols static route6` (ipv6) into one flat, family-tagged list,
 * sorted by family then destination. */
export function parseStaticRoutes(protocolsStatic: unknown): StaticRoute[] {
  const routes: StaticRoute[] = []

  for (const family of ['ipv4', 'ipv6'] as const) {
    const root = child(protocolsStatic, chainName(family))
    if (!isRecord(root)) continue

    for (const [destination, raw] of Object.entries(root)) {
      routes.push({
        family,
        destination,
        nextHops: parseNextHops(raw),
        interfaces: parseInterfaces(raw),
        dhcpInterfaces: asArray(child(raw, 'dhcp-interface')),
        reject: isFlagPresent(raw, 'reject') ? parseRejectOrBlackhole(child(raw, 'reject')) : undefined,
        blackhole: isFlagPresent(raw, 'blackhole')
          ? parseRejectOrBlackhole(child(raw, 'blackhole'))
          : undefined,
      })
    }
  }

  return routes.sort(
    (a, b) => a.family.localeCompare(b.family) || a.destination.localeCompare(b.destination),
  )
}

/** Builds the VyOS path prefix for a static route destination
 * (everything up to, but not including, its own fields like
 * `next-hop <addr>` or `reject`). */
export function staticRoutePath(family: RouteFamily, destination: string, ...rest: string[]): string[] {
  return ['protocols', 'static', chainName(family), destination, ...rest]
}
