/**
 * Typed, UI-friendly shapes for VyOS's `container` config tree
 * (Podman-based). Confirmed directly against vyos-1x's own
 * interface-definition XML source
 * (`interface-definitions/container.xml.in`, plus its shared
 * `#include`s), not just docs.vyos.io's prose page - unlike several
 * earlier areas (OSPF, System), the prose page turned out to be
 * accurate here, so there's no staleness correction to note this
 * time.
 *
 * Scoped per explicit product decision to all three config-tree
 * tagNodes:
 *
 * 1. `container name <name>` - individual container definitions.
 *    Covers every leaf/child node VyOS exposes: image, entrypoint/
 *    command/arguments, host-name, description, disable,
 *    allow-host-pid/allow-host-networks/privileged, the 11-value
 *    `capability` enum, sysctl parameters, devices, environment
 *    variables, labels, cpu-quota/memory/shared-memory limits,
 *    name-servers, network attachments (address/mac), port mappings,
 *    restart policy, uid/gid, tmpfs mounts, volume mounts, log-driver,
 *    and health-check.
 * 2. `container network <name>` - user-defined Podman networks
 *    (description, MTU, gateway/prefix, no-name-server, bridge vs.
 *    macvlan type, VRF).
 * 3. `container registry <name>` - registry auth/mirror config
 *    (username/password - password write-only like every other masked
 *    credential, disable, insecure, mirror address/host-name/port/
 *    path).
 *
 * Container image pull/list/delete (`add container image`, `show
 * container image`, `delete container image`) is a separate, later
 * addition - see hooks/useContainerImages.ts, lib/vyosApi.ts's
 * pullContainerImage/deleteContainerImage, and
 * pages/container/ImagesPage.tsx. Those are VyOS *op-mode* commands,
 * not part of `/configure` at all, so they're applied immediately
 * rather than staged through the pending-changes cart like everything
 * in this file - a container definition here can still reference an
 * image that hasn't been pulled yet (ContainerForm.tsx's
 * ImagePullPrompt flags this case in the UI, rather than blocking it).
 */

export const CONTAINER_CAPABILITIES = [
  'net-admin',
  'net-bind-service',
  'net-raw',
  'chown',
  'mknod',
  'setpcap',
  'sys-admin',
  'sys-module',
  'sys-nice',
  'sys-rawio',
  'sys-time',
] as const

export const CONTAINER_RESTART_POLICIES = ['no', 'on-failure', 'always'] as const

export const CONTAINER_LOG_DRIVERS = ['k8s-file', 'journald', 'none'] as const

export const CONTAINER_VOLUME_MODES = ['ro', 'rw'] as const

export const CONTAINER_VOLUME_PROPAGATIONS = [
  'shared',
  'slave',
  'private',
  'rshared',
  'rslave',
  'rprivate',
] as const

export const CONTAINER_PORT_PROTOCOLS = ['tcp', 'udp'] as const

export const CONTAINER_MACVLAN_MODES = ['bridge', 'private', 'vepa'] as const

export interface ContainerSysctlParameter {
  parameter: string
  value: string
}

export interface ContainerDevice {
  /** Tag identifier - arbitrary user-chosen name, VyOS doesn't
   * require any particular format for it. */
  id: string
  source?: string
  destination?: string
}

export interface ContainerEnvironmentVariable {
  name: string
  value: string
}

export interface ContainerLabel {
  name: string
  value: string
}

export interface ContainerNetworkAttachment {
  /** References a `container network <name>` definition (or the
   * implicit default bridge network if none is attached). */
  networkName: string
  addresses: string[]
  /** Defaults to 'auto' (random MAC) in VyOS if unset. */
  mac?: string
}

export interface ContainerPort {
  /** Tag identifier - arbitrary user-chosen name. */
  id: string
  listenAddresses: string[]
  source?: string
  destination?: string
  /** Defaults to 'tcp' in VyOS if unset. */
  protocol?: string
}

export interface ContainerTmpfs {
  /** Tag identifier - arbitrary user-chosen name. */
  id: string
  destination?: string
  size?: string
}

export interface ContainerVolume {
  /** Tag identifier - arbitrary user-chosen name. */
  id: string
  source?: string
  destination?: string
  /** Defaults to 'rw' in VyOS if unset. */
  mode?: string
  /** Defaults to 'rprivate' in VyOS if unset. */
  propagation?: string
}

export interface ContainerHealthCheck {
  command?: string
  /** Numeric seconds, or the literal string 'disable'. */
  interval?: string
  timeout?: string
  retry?: string
}

export function blankHealthCheck(): ContainerHealthCheck {
  return {}
}

export interface ContainerDefinition {
  name: string
  image?: string
  description?: string
  disabled: boolean
  allowHostPid: boolean
  allowHostNetworks: boolean
  privileged: boolean
  capabilities: string[]
  entrypoint?: string
  command?: string
  arguments?: string
  hostName?: string
  /** Defaults to 'on-failure' in VyOS if unset. */
  restart?: string
  /** Defaults to '0' (unlimited) in VyOS if unset. */
  cpuQuota?: string
  /** Defaults to '512' MB in VyOS if unset. */
  memory?: string
  /** Defaults to '64' MB in VyOS if unset. */
  sharedMemory?: string
  uid?: string
  gid?: string
  /** Defaults to 'journald' in VyOS if unset. */
  logDriver?: string
  nameServers: string[]
  sysctl: ContainerSysctlParameter[]
  devices: ContainerDevice[]
  environment: ContainerEnvironmentVariable[]
  labels: ContainerLabel[]
  networks: ContainerNetworkAttachment[]
  ports: ContainerPort[]
  tmpfs: ContainerTmpfs[]
  volumes: ContainerVolume[]
  healthCheck: ContainerHealthCheck
}

export function blankContainerDefinition(): Omit<ContainerDefinition, 'name'> {
  return {
    disabled: false,
    allowHostPid: false,
    allowHostNetworks: false,
    privileged: false,
    capabilities: [],
    nameServers: [],
    sysctl: [],
    devices: [],
    environment: [],
    labels: [],
    networks: [],
    ports: [],
    tmpfs: [],
    volumes: [],
    healthCheck: blankHealthCheck(),
  }
}

export interface ContainerNetworkMacvlan {
  mode?: string
  parent?: string
}

export interface ContainerNetwork {
  name: string
  description?: string
  mtu?: string
  gateways: string[]
  prefixes: string[]
  noNameServer: boolean
  /** Undefined = VyOS's implicit default (bridge). */
  type?: 'bridge' | 'macvlan'
  macvlan?: ContainerNetworkMacvlan
  vrf?: string
}

export function blankContainerNetwork(): Omit<ContainerNetwork, 'name'> {
  return { gateways: [], prefixes: [], noNameServer: false }
}

export interface ContainerRegistryMirror {
  address?: string
  hostName?: string
  port?: string
  path?: string
}

export interface ContainerRegistry {
  name: string
  username?: string
  /** Write-only, like every other masked credential in this app - see
   * SystemUser.hasPassword's doc comment for the general convention. */
  hasPassword: boolean
  disabled: boolean
  insecure: boolean
  mirror?: ContainerRegistryMirror
}

export function blankContainerRegistry(): Omit<ContainerRegistry, 'name'> {
  return { hasPassword: false, disabled: false, insecure: false }
}

export interface ContainerConfig {
  containers: ContainerDefinition[]
  networks: ContainerNetwork[]
  registries: ContainerRegistry[]
}

export function blankContainerConfig(): ContainerConfig {
  return { containers: [], networks: [], registries: [] }
}
