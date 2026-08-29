import {
  blankAddressFamilySettings,
  type BGPAddressFamilySettings,
  type BGPConfig,
  type BGPNetworkAdvertisement,
  type BGPPeer,
  type BGPPeerKind,
  type BGPRedistribution,
} from './bgpTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see routingParse.ts's own copy
// of this comment for why this matches the rest of the codebase.)

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

// --- neighbors / peer-groups ---------------------------------------------

function parseAddressFamilySettings(raw: unknown): BGPAddressFamilySettings {
  return {
    nexthopSelf: isFlagPresent(raw, 'nexthop-self'),
    removePrivateAs: isFlagPresent(raw, 'remove-private-as'),
    softReconfigurationInbound: isFlagPresent(child(raw, 'soft-reconfiguration'), 'inbound'),
    maximumPrefix: asString(child(raw, 'maximum-prefix')),
  }
}

function parsePeer(identifier: string, kind: BGPPeerKind, raw: unknown): BGPPeer {
  const afRoot = child(raw, 'address-family')
  return {
    identifier,
    kind,
    remoteAs: asString(child(raw, 'remote-as')),
    description: asString(child(raw, 'description')),
    hasPassword: isFlagPresent(raw, 'password'),
    shutdown: isFlagPresent(raw, 'shutdown'),
    passive: isFlagPresent(raw, 'passive'),
    ebgpMultihop: asString(child(raw, 'ebgp-multihop')),
    updateSource: asString(child(raw, 'update-source')),
    peerGroup: asString(child(raw, 'peer-group')),
    ipv4Unicast: isRecord(child(afRoot, 'ipv4-unicast'))
      ? parseAddressFamilySettings(child(afRoot, 'ipv4-unicast'))
      : blankAddressFamilySettings(),
    ipv6Unicast: isRecord(child(afRoot, 'ipv6-unicast'))
      ? parseAddressFamilySettings(child(afRoot, 'ipv6-unicast'))
      : blankAddressFamilySettings(),
  }
}

function parsePeers(bgp: unknown, node: 'neighbor' | 'peer-group', kind: BGPPeerKind): BGPPeer[] {
  const root = child(bgp, node)
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([identifier, raw]) => parsePeer(identifier, kind, raw))
    .sort((a, b) => a.identifier.localeCompare(b.identifier))
}

// --- network advertisement / redistribution -------------------------------

function parseNetworks(bgp: unknown): BGPNetworkAdvertisement[] {
  const networks: BGPNetworkAdvertisement[] = []
  for (const family of ['ipv4', 'ipv6'] as const) {
    const afNode = family === 'ipv4' ? 'ipv4-unicast' : 'ipv6-unicast'
    const root = child(child(child(bgp, 'address-family'), afNode), 'network')
    if (!isRecord(root)) continue
    for (const prefix of Object.keys(root)) {
      networks.push({ family, prefix })
    }
  }
  return networks.sort((a, b) => a.family.localeCompare(b.family) || a.prefix.localeCompare(b.prefix))
}

function parseRedistributions(bgp: unknown): BGPRedistribution[] {
  const redistributions: BGPRedistribution[] = []
  for (const family of ['ipv4', 'ipv6'] as const) {
    const afNode = family === 'ipv4' ? 'ipv4-unicast' : 'ipv6-unicast'
    const root = child(child(child(bgp, 'address-family'), afNode), 'redistribute')
    if (!isRecord(root)) continue
    for (const [source, raw] of Object.entries(root)) {
      redistributions.push({ family, source, metric: asString(child(raw, 'metric')) })
    }
  }
  return redistributions.sort(
    (a, b) => a.family.localeCompare(b.family) || a.source.localeCompare(b.source),
  )
}

// --- top level -------------------------------------------------------------

export function parseBGPConfig(bgp: unknown): BGPConfig {
  return {
    systemAs: asString(child(bgp, 'system-as')),
    routerId: asString(child(child(bgp, 'parameters'), 'router-id')),
    neighbors: parsePeers(bgp, 'neighbor', 'neighbor'),
    peerGroups: parsePeers(bgp, 'peer-group', 'peer-group'),
    networks: parseNetworks(bgp),
    redistributions: parseRedistributions(bgp),
  }
}

// --- path builders -----------------------------------------------------

export function bgpPath(...rest: string[]): string[] {
  return ['protocols', 'bgp', ...rest]
}

export function bgpPeerPath(kind: BGPPeerKind, identifier: string, ...rest: string[]): string[] {
  return bgpPath(kind, identifier, ...rest)
}

export function bgpAddressFamilyPath(family: 'ipv4' | 'ipv6', ...rest: string[]): string[] {
  return bgpPath('address-family', family === 'ipv6' ? 'ipv6-unicast' : 'ipv4-unicast', ...rest)
}
