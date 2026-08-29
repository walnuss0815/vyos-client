import {
  blankGlobalSettings,
  type OSPFArea,
  type OSPFAreaRange,
  type OSPFConfig,
  type OSPFGlobalSettings,
  type OSPFInterface,
  type OSPFProcessConfig,
  type OSPFProtocol,
  type OSPFRedistribution,
} from './ospfTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/routingParse.ts's
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

// --- areas -----------------------------------------------------------

function parseAreaRange(protocol: OSPFProtocol, prefix: string, raw: unknown): OSPFAreaRange {
  return {
    prefix,
    notAdvertise: isFlagPresent(raw, 'not-advertise'),
    cost: protocol === 'ospf' ? asString(child(raw, 'cost')) : undefined,
    substitute: protocol === 'ospf' ? asString(child(raw, 'substitute')) : undefined,
  }
}

function parseArea(protocol: OSPFProtocol, id: string, raw: unknown): OSPFArea {
  const areaTypeRoot = child(raw, 'area-type')
  const stub = child(areaTypeRoot, 'stub')
  const nssa = child(areaTypeRoot, 'nssa')
  const areaType = isRecord(nssa) ? 'nssa' : isRecord(stub) ? 'stub' : undefined
  const activeTypeNode = areaType === 'nssa' ? nssa : areaType === 'stub' ? stub : undefined

  const rangeRoot = child(raw, 'range')
  const ranges = isRecord(rangeRoot)
    ? Object.entries(rangeRoot)
        .map(([prefix, r]) => parseAreaRange(protocol, prefix, r))
        .sort((a, b) => a.prefix.localeCompare(b.prefix))
    : []

  return {
    id,
    networks: protocol === 'ospf' ? asStringArray(child(raw, 'network')) : [],
    areaType,
    noSummary: isFlagPresent(activeTypeNode, 'no-summary'),
    defaultCost: asString(child(activeTypeNode, 'default-cost')),
    nssaTranslate:
      protocol === 'ospf' && areaType === 'nssa'
        ? (asString(child(nssa, 'translate')) as 'always' | 'candidate' | 'never' | undefined)
        : undefined,
    nssaDefaultInformationOriginate:
      protocol === 'ospfv3' && areaType === 'nssa'
        ? isFlagPresent(nssa, 'default-information-originate')
        : false,
    authentication:
      protocol === 'ospf'
        ? (asString(child(raw, 'authentication')) as 'plaintext-password' | 'md5' | undefined)
        : undefined,
    ranges,
  }
}

function parseAreas(protocol: OSPFProtocol, root: unknown): OSPFArea[] {
  const areaRoot = child(root, 'area')
  if (!isRecord(areaRoot)) return []
  return Object.entries(areaRoot)
    .map(([id, raw]) => parseArea(protocol, id, raw))
    .sort((a, b) => a.id.localeCompare(b.id))
}

// --- interfaces --------------------------------------------------------

function parseInterfaceAuth(protocol: OSPFProtocol, raw: unknown) {
  if (protocol !== 'ospf') {
    return { authMode: undefined, hasPlaintextPassword: false, md5KeyId: undefined, hasMd5Key: false }
  }
  const authRoot = child(raw, 'authentication')
  if (isFlagPresent(authRoot, 'null')) {
    return { authMode: 'null' as const, hasPlaintextPassword: false, md5KeyId: undefined, hasMd5Key: false }
  }
  if (isFlagPresent(authRoot, 'plaintext-password')) {
    return {
      authMode: 'plaintext-password' as const,
      hasPlaintextPassword: true,
      md5KeyId: undefined,
      hasMd5Key: false,
    }
  }
  const md5Root = child(authRoot, 'md5')
  const keyIdRoot = child(md5Root, 'key-id')
  if (isRecord(keyIdRoot)) {
    const [firstKeyId, firstKeyRaw] = Object.entries(keyIdRoot).sort(([a], [b]) => a.localeCompare(b))[0] ?? []
    if (firstKeyId !== undefined) {
      return {
        authMode: 'md5' as const,
        hasPlaintextPassword: false,
        md5KeyId: firstKeyId,
        hasMd5Key: isFlagPresent(firstKeyRaw, 'md5-key'),
      }
    }
  }
  return { authMode: undefined, hasPlaintextPassword: false, md5KeyId: undefined, hasMd5Key: false }
}

function parseInterface(protocol: OSPFProtocol, name: string, raw: unknown): OSPFInterface {
  const auth = parseInterfaceAuth(protocol, raw)
  return {
    name,
    area: asString(child(raw, 'area')),
    cost: asString(child(raw, 'cost')),
    priority: asString(child(raw, 'priority')),
    deadInterval: asString(child(raw, 'dead-interval')),
    helloInterval: asString(child(raw, 'hello-interval')),
    passive: isFlagPresent(raw, 'passive'),
    networkType: asString(child(raw, 'network')),
    mtuIgnore: isFlagPresent(raw, 'mtu-ignore'),
    bfd: isFlagPresent(raw, 'bfd'),
    ...auth,
  }
}

function parseInterfaces(protocol: OSPFProtocol, root: unknown): OSPFInterface[] {
  const ifaceRoot = child(root, 'interface')
  if (!isRecord(ifaceRoot)) return []
  return Object.entries(ifaceRoot)
    .map(([name, raw]) => parseInterface(protocol, name, raw))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- redistribution ------------------------------------------------------

function parseRedistributions(root: unknown): OSPFRedistribution[] {
  const redistRoot = child(root, 'redistribute')
  if (!isRecord(redistRoot)) return []
  return Object.entries(redistRoot)
    .map(([source, raw]) => ({
      source,
      metric: asString(child(raw, 'metric')),
      metricType: asString(child(raw, 'metric-type')) as '1' | '2' | undefined,
    }))
    .sort((a, b) => a.source.localeCompare(b.source))
}

// --- global settings -------------------------------------------------

function parseGlobalSettings(protocol: OSPFProtocol, root: unknown): OSPFGlobalSettings {
  const distanceRoot = child(root, 'distance')
  const perProtocolDistance = child(distanceRoot, protocol)
  const originateRoot = child(child(root, 'default-information'), 'originate')

  return {
    routerId: asString(child(child(root, 'parameters'), 'router-id')),
    autoCostReferenceBandwidth: asString(child(child(root, 'auto-cost'), 'reference-bandwidth')),
    distanceGlobal: asString(child(distanceRoot, 'global')),
    distanceExternal: asString(child(perProtocolDistance, 'external')),
    distanceInterArea: asString(child(perProtocolDistance, 'inter-area')),
    distanceIntraArea: asString(child(perProtocolDistance, 'intra-area')),
    defaultInformationOriginateAlways: isFlagPresent(originateRoot, 'always'),
    defaultInformationOriginateMetric: asString(child(originateRoot, 'metric')),
    defaultInformationOriginateMetricType: asString(child(originateRoot, 'metric-type')) as
      | '1'
      | '2'
      | undefined,
    defaultMetric: protocol === 'ospf' ? asString(child(root, 'default-metric')) : undefined,
  }
}

// --- top level -------------------------------------------------------------

function parseProcess(protocol: OSPFProtocol, root: unknown): OSPFProcessConfig {
  return {
    global: root === undefined ? blankGlobalSettings() : parseGlobalSettings(protocol, root),
    areas: parseAreas(protocol, root),
    interfaces: parseInterfaces(protocol, root),
    redistributions: parseRedistributions(root),
  }
}

export function parseOSPFConfig(ospf: unknown, ospfv3: unknown): OSPFConfig {
  return {
    ospf: parseProcess('ospf', ospf),
    ospfv3: parseProcess('ospfv3', ospfv3),
  }
}

// --- path builders -----------------------------------------------------

export function ospfPath(protocol: OSPFProtocol, ...rest: string[]): string[] {
  return ['protocols', protocol, ...rest]
}

export function ospfAreaPath(protocol: OSPFProtocol, areaId: string, ...rest: string[]): string[] {
  return ospfPath(protocol, 'area', areaId, ...rest)
}

export function ospfInterfacePath(protocol: OSPFProtocol, name: string, ...rest: string[]): string[] {
  return ospfPath(protocol, 'interface', name, ...rest)
}
