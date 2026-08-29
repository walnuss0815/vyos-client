import {
  blankContainerConfig,
  blankContainerDefinition,
  blankContainerNetwork,
  blankContainerRegistry,
  blankHealthCheck,
  type ContainerConfig,
  type ContainerDefinition,
  type ContainerDevice,
  type ContainerEnvironmentVariable,
  type ContainerHealthCheck,
  type ContainerLabel,
  type ContainerNetwork,
  type ContainerNetworkAttachment,
  type ContainerPort,
  type ContainerRegistry,
  type ContainerRegistryMirror,
  type ContainerSysctlParameter,
  type ContainerTmpfs,
  type ContainerVolume,
} from './containerTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/ospfParse.ts's/
// systemParse.ts's/natParse.ts's own copy of this comment for why this
// matches the rest of the codebase.)

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

// --- container name ------------------------------------------------------

function parseSysctl(raw: unknown): ContainerSysctlParameter[] {
  return entries(child(raw, 'parameter'))
    .map(([parameter, v]) => ({ parameter, value: asString(child(v, 'value')) ?? '' }))
    .sort((a, b) => a.parameter.localeCompare(b.parameter))
}

function parseDevices(raw: unknown): ContainerDevice[] {
  return entries(child(raw, 'device'))
    .map(([id, v]): ContainerDevice => ({
      id,
      source: asString(child(v, 'source')),
      destination: asString(child(v, 'destination')),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function parseEnvironment(raw: unknown): ContainerEnvironmentVariable[] {
  return entries(child(raw, 'environment'))
    .map(([name, v]) => ({ name, value: asString(child(v, 'value')) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function parseLabels(raw: unknown): ContainerLabel[] {
  return entries(child(raw, 'label'))
    .map(([name, v]) => ({ name, value: asString(child(v, 'value')) ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function parseNetworkAttachments(raw: unknown): ContainerNetworkAttachment[] {
  return entries(child(raw, 'network'))
    .map(([networkName, v]): ContainerNetworkAttachment => ({
      networkName,
      addresses: asStringArray(child(v, 'address')),
      mac: asString(child(v, 'mac')),
    }))
    .sort((a, b) => a.networkName.localeCompare(b.networkName))
}

function parsePorts(raw: unknown): ContainerPort[] {
  return entries(child(raw, 'port'))
    .map(([id, v]): ContainerPort => ({
      id,
      listenAddresses: asStringArray(child(v, 'listen-address')),
      source: asString(child(v, 'source')),
      destination: asString(child(v, 'destination')),
      protocol: asString(child(v, 'protocol')),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function parseTmpfs(raw: unknown): ContainerTmpfs[] {
  return entries(child(raw, 'tmpfs'))
    .map(([id, v]): ContainerTmpfs => ({
      id,
      destination: asString(child(v, 'destination')),
      size: asString(child(v, 'size')),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function parseVolumes(raw: unknown): ContainerVolume[] {
  return entries(child(raw, 'volume'))
    .map(([id, v]): ContainerVolume => ({
      id,
      source: asString(child(v, 'source')),
      destination: asString(child(v, 'destination')),
      mode: asString(child(v, 'mode')),
      propagation: asString(child(v, 'propagation')),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function parseHealthCheck(raw: unknown): ContainerHealthCheck {
  const root = child(raw, 'health-check')
  if (root === undefined) return blankHealthCheck()
  return {
    command: asString(child(root, 'command')),
    interval: asString(child(root, 'interval')),
    timeout: asString(child(root, 'timeout')),
    retry: asString(child(root, 'retry')),
  }
}

function parseContainerDefinition(name: string, raw: unknown): ContainerDefinition {
  return {
    name,
    ...blankContainerDefinition(),
    image: asString(child(raw, 'image')),
    description: asString(child(raw, 'description')),
    disabled: isFlagPresent(raw, 'disable'),
    allowHostPid: isFlagPresent(raw, 'allow-host-pid'),
    allowHostNetworks: isFlagPresent(raw, 'allow-host-networks'),
    privileged: isFlagPresent(raw, 'privileged'),
    capabilities: asStringArray(child(raw, 'capability')),
    entrypoint: asString(child(raw, 'entrypoint')),
    command: asString(child(raw, 'command')),
    arguments: asString(child(raw, 'arguments')),
    hostName: asString(child(raw, 'host-name')),
    restart: asString(child(raw, 'restart')),
    cpuQuota: asString(child(raw, 'cpu-quota')),
    memory: asString(child(raw, 'memory')),
    sharedMemory: asString(child(raw, 'shared-memory')),
    uid: asString(child(raw, 'uid')),
    gid: asString(child(raw, 'gid')),
    logDriver: asString(child(raw, 'log-driver')),
    nameServers: asStringArray(child(raw, 'name-server')),
    sysctl: parseSysctl(child(raw, 'sysctl')),
    devices: parseDevices(raw),
    environment: parseEnvironment(raw),
    labels: parseLabels(raw),
    networks: parseNetworkAttachments(raw),
    ports: parsePorts(raw),
    tmpfs: parseTmpfs(raw),
    volumes: parseVolumes(raw),
    healthCheck: parseHealthCheck(raw),
  }
}

export function parseContainers(container: unknown): ContainerDefinition[] {
  return entries(child(container, 'name'))
    .map(([name, raw]) => parseContainerDefinition(name, raw))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- container network ----------------------------------------------------

function parseNetworkType(raw: unknown): Pick<ContainerNetwork, 'type' | 'macvlan'> {
  const typeRoot = child(raw, 'type')
  if (isFlagPresent(typeRoot, 'bridge')) return { type: 'bridge' }
  const macvlanRoot = child(typeRoot, 'macvlan')
  if (macvlanRoot !== undefined) {
    return {
      type: 'macvlan',
      macvlan: {
        mode: asString(child(macvlanRoot, 'mode')),
        parent: asString(child(macvlanRoot, 'parent')),
      },
    }
  }
  return {}
}

function parseContainerNetwork(name: string, raw: unknown): ContainerNetwork {
  return {
    name,
    ...blankContainerNetwork(),
    description: asString(child(raw, 'description')),
    mtu: asString(child(raw, 'mtu')),
    gateways: asStringArray(child(raw, 'gateway')),
    prefixes: asStringArray(child(raw, 'prefix')),
    noNameServer: isFlagPresent(raw, 'no-name-server'),
    vrf: asString(child(raw, 'vrf')),
    ...parseNetworkType(raw),
  }
}

export function parseContainerNetworks(container: unknown): ContainerNetwork[] {
  return entries(child(container, 'network'))
    .map(([name, raw]) => parseContainerNetwork(name, raw))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- container registry ---------------------------------------------------

function parseMirror(raw: unknown): ContainerRegistryMirror | undefined {
  const root = child(raw, 'mirror')
  if (root === undefined) return undefined
  return {
    address: asString(child(root, 'address')),
    hostName: asString(child(root, 'host-name')),
    port: asString(child(root, 'port')),
    path: asString(child(root, 'path')),
  }
}

function parseContainerRegistry(name: string, raw: unknown): ContainerRegistry {
  const authRoot = child(raw, 'authentication')
  return {
    name,
    ...blankContainerRegistry(),
    username: asString(child(authRoot, 'username')),
    hasPassword: child(authRoot, 'password') !== undefined,
    disabled: isFlagPresent(raw, 'disable'),
    insecure: isFlagPresent(raw, 'insecure'),
    mirror: parseMirror(raw),
  }
}

export function parseContainerRegistries(container: unknown): ContainerRegistry[] {
  return entries(child(container, 'registry'))
    .map(([name, raw]) => parseContainerRegistry(name, raw))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- top level -------------------------------------------------------------

export function parseContainerConfig(container: unknown): ContainerConfig {
  if (container === undefined) return blankContainerConfig()
  return {
    containers: parseContainers(container),
    networks: parseContainerNetworks(container),
    registries: parseContainerRegistries(container),
  }
}

// --- path builders -----------------------------------------------------

export function containerPath(...rest: string[]): string[] {
  return ['container', ...rest]
}

export function containerNamePath(name: string, ...rest: string[]): string[] {
  return containerPath('name', name, ...rest)
}

export function containerSysctlPath(name: string, parameter: string, ...rest: string[]): string[] {
  return containerNamePath(name, 'sysctl', 'parameter', parameter, ...rest)
}

export function containerDevicePath(name: string, id: string, ...rest: string[]): string[] {
  return containerNamePath(name, 'device', id, ...rest)
}

export function containerEnvironmentPath(name: string, varName: string, ...rest: string[]): string[] {
  return containerNamePath(name, 'environment', varName, ...rest)
}

export function containerLabelPath(name: string, labelName: string, ...rest: string[]): string[] {
  return containerNamePath(name, 'label', labelName, ...rest)
}

export function containerNetworkAttachmentPath(
  name: string,
  networkName: string,
  ...rest: string[]
): string[] {
  return containerNamePath(name, 'network', networkName, ...rest)
}

export function containerPortPath(name: string, id: string, ...rest: string[]): string[] {
  return containerNamePath(name, 'port', id, ...rest)
}

export function containerTmpfsPath(name: string, id: string, ...rest: string[]): string[] {
  return containerNamePath(name, 'tmpfs', id, ...rest)
}

export function containerVolumePath(name: string, id: string, ...rest: string[]): string[] {
  return containerNamePath(name, 'volume', id, ...rest)
}

export function containerHealthCheckPath(name: string, ...rest: string[]): string[] {
  return containerNamePath(name, 'health-check', ...rest)
}

export function containerNetworkPath(name: string, ...rest: string[]): string[] {
  return containerPath('network', name, ...rest)
}

export function containerRegistryPath(name: string, ...rest: string[]): string[] {
  return containerPath('registry', name, ...rest)
}
