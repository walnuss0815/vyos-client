import { apiRequest } from './api'

export interface LoginResponse {
  user: string
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', { body: { username, password } })
}

export function logout(): Promise<void> {
  return apiRequest<void>('/api/auth/logout', { method: 'POST' })
}

export function getSession(): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/session')
}

export interface ConfigTreeResponse {
  data: unknown
}

/** Fetches the (masked) configuration subtree rooted at path. An empty
 * path fetches the entire configuration. */
export function getConfigTree(path: string[] = []): Promise<ConfigTreeResponse> {
  return apiRequest<ConfigTreeResponse>('/api/config/tree', {
    query: { path: path.length ? path.join(',') : undefined },
  })
}

export interface SetCommandsResponse {
  text: string
}

export function getSetCommands(): Promise<SetCommandsResponse> {
  return apiRequest<SetCommandsResponse>('/api/config/set-commands')
}

export interface RevealResponse {
  value: string
}

/** Fetches the real, unmasked value of a single sensitive config leaf
 * on demand - see backend/internal/api/config_handlers.go's
 * handleReveal for the full rationale (POST body rather than a query
 * param, scoped to sensitive leaves only, audit-logged server-side,
 * single-value leaves only). Deliberately not cached via TanStack
 * Query - callers should keep the revealed value in local component
 * state that's cleared on toggle-off/unmount, not in a shared cache a
 * different component could read back. */
export function revealValue(path: string[]): Promise<RevealResponse> {
  return apiRequest<RevealResponse>('/api/config/reveal', { body: { path } })
}

export interface SystemInfo {
  hostname: string
  version: string
  /** VyOS's own configured `system login banner` text, empty when the
   * router has none. Shown as the first element of the Dashboard - see
   * DashboardPage.tsx. Not sensitive: it's text VyOS itself shows to
   * anyone reaching the router's CLI/API pre-auth. */
  loginBanner: string
  /** Mirrors the backend's CONFIG_WARNINGS_ENABLED env var (see
   * docs/configuration-reference.md) - an opt-in, disabled-by-default
   * deployment setting, not VyOS state. ConfigWarningsBanner.tsx reads
   * this to decide whether to run its checks at all. */
  configWarningsEnabled: boolean
}

/** Live system identity (hostname + VyOS version), sourced from VyOS's
 * own GET /info rather than the configured `system host-name` - one
 * request for both, and reflects live system state rather than just
 * configured intent. */
export function getSystemInfo(): Promise<SystemInfo> {
  return apiRequest<SystemInfo>('/api/system/info')
}

/** `reboot now` - see PowerPage.tsx for the frontend confirmation flow
 * and backend/internal/api/power_handlers.go's handleReboot for why
 * the confirmation itself is a frontend-only concern. */
export function rebootSystem(): Promise<void> {
  return apiRequest<void>('/api/system/reboot', { method: 'POST' })
}

/** `poweroff now`. See rebootSystem's doc comment. */
export function poweroffSystem(): Promise<void> {
  return apiRequest<void>('/api/system/poweroff', { method: 'POST' })
}

/** One entry from `show system image` - a VyOS release installed on
 * this router, entirely distinct from container images
 * (ContainerImage above). `isDefaultBoot` is which image starts next
 * time the router reboots (switching it, via a normal
 * `system image default-boot` config write, plus a reboot, is how
 * VyOS rolls back to a previously-installed version - see
 * ImagesPage.tsx under System). */
export interface SystemImage {
  name: string
  isDefaultBoot: boolean
  isRunning: boolean
}

export interface SystemImagesResponse {
  images: SystemImage[]
}

/** Every VyOS release installed on this router. */
export function getSystemImages(): Promise<SystemImagesResponse> {
  return apiRequest<SystemImagesResponse>('/api/system/images')
}

export interface SystemImageActionResponse {
  /** Whatever text VyOS's own installer/delete script printed - shown
   * as-is, same convention as ContainerImageActionResponse. */
  message: string
}

/** Installs a new VyOS release - `add system image <url>`. Can
 * legitimately take many minutes to download and install a full ISO;
 * no progress reporting mid-flight, just a single request that
 * resolves once the install finishes or fails. Installing a new image
 * does not itself switch the router to boot into it or reboot -
 * that's a separate "Set as default boot" + reboot step. */
export function addSystemImage(url: string): Promise<SystemImageActionResponse> {
  return apiRequest<SystemImageActionResponse>('/api/system/images', { body: { url } })
}

/** Deletes an installed-but-unused VyOS release - `delete system
 * image <name>`. VyOS itself refuses to delete the currently-running
 * or default-boot image, surfaced as an ordinary error. */
export function deleteSystemImage(name: string): Promise<SystemImageActionResponse> {
  return apiRequest<SystemImageActionResponse>('/api/system/images', {
    method: 'DELETE',
    query: { name },
  })
}

export interface SystemUptime {
  /** VyOS's own human-formatted duration string (e.g. "3w 2d 5h 12m
   * 45s") - only non-zero units are included, so a freshly-booted
   * router's uptime can be as short as "5m 12s". */
  uptime: string
  /** Per-core-normalized load, as a percentage (0-100) - not classic
   * Unix load averages. */
  load1: number
  load5: number
  load15: number
}

export interface SystemCPU {
  cores: number
  model?: string
}

export interface SystemMemory {
  totalBytes: number
  freeBytes: number
  usedBytes: number
}

export interface SystemStorage {
  filesystem: string
  sizeBytes: number
  usedBytes: number
  availBytes: number
}

export interface SystemResources {
  uptime: SystemUptime
  cpu: SystemCPU
  memory: SystemMemory
  /** Absent when VyOS itself reports storage stats as unavailable
   * (e.g. running from a bare live CD before install) - not a request
   * failure, just nothing to show. */
  storage?: SystemStorage
}

/** Live uptime, CPU, memory, and disk usage - distinct from
 * getSystemInfo (hostname/version, which can't change without a
 * commit+reboot). */
export function getSystemResources(): Promise<SystemResources> {
  return apiRequest<SystemResources>('/api/system/resources')
}

export interface InterfaceAddress {
  family: string
  address: string
  prefixLen: number
  scope: string
}

export interface NetworkInterface {
  name: string
  mac?: string
  description?: string
  mtu: number
  operState: string
  adminState: string
  addresses: InterfaceAddress[]
  /** Cumulative byte counters since the interface last came up - not a
   * rate. Absent (rather than 0) when the kernel didn't report
   * statistics for this interface at all; see useInterfaceThroughput
   * for how a bytes/sec rate is derived from successive polls. */
  rxBytes?: number
  txBytes?: number
}

export interface InterfacesResponse {
  interfaces: NetworkInterface[]
}

/** Live interface state (MAC, assigned IPv4/IPv6 addresses, link
 * status) - distinct from interface configuration, which the Config
 * Tree/Firewall zone UI cover separately. */
export function getInterfaces(): Promise<InterfacesResponse> {
  return apiRequest<InterfacesResponse>('/api/interfaces')
}

export interface RouteNexthop {
  ip?: string
  interfaceName?: string
  active: boolean
  directlyConnected?: boolean
}

export interface Route {
  prefix: string
  protocol: string
  selected: boolean
  distance: number
  metric: number
  uptime?: string
  nexthops: RouteNexthop[]
}

export interface RoutesResponse {
  ipv4: Route[]
  ipv6: Route[]
}

export function getRoutes(): Promise<RoutesResponse> {
  return apiRequest<RoutesResponse>('/api/routes')
}

export interface DHCPLease {
  ipAddress: string
  macAddress: string
  state: string
  leaseStart: string
  leaseEnd: string
  remaining: string
  pool: string
  hostname: string
  origin: string
  /** The configured DHCP subnet CIDR this lease's address falls
   * under, resolved server-side - the target for "make static".
   * Empty if it couldn't be resolved, in which case "make static" is
   * unavailable for this lease. */
  subnet?: string
}

export interface DHCPLeasesResponse {
  leases: DHCPLease[]
}

/** Live DHCP leases (dynamic assignments) - distinct from static
 * mappings (config, read/written like anything else under `service
 * dhcp-server`). */
export function getDHCPLeases(): Promise<DHCPLeasesResponse> {
  return apiRequest<DHCPLeasesResponse>('/api/dhcp/leases')
}

/** Syslog facility names `?source=facility&facility=<value>` accepts -
 * matches the backend's own `vyos.LogFacilities` list one-for-one
 * (backend/internal/vyos/logs.go), hardcoded here rather than fetched
 * since it's a fixed, VyOS-version-independent enum - the same
 * convention this app already uses for other small fixed value lists
 * (e.g. SSH key types, SNMP auth types). */
export const LOG_FACILITIES = [
  'kern', 'user', 'mail', 'daemon', 'auth', 'syslog', 'lpr', 'news',
  'uucp', 'cron', 'authpriv', 'ftp',
  'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7',
] as const

/** Minimum-severity levels `?source=priority&priority=<value>` accepts
 * - matches the backend's `vyos.LogPriorities` list. "err" includes
 * err/crit/alert/emerg but not warning/notice/info/debug. */
export const LOG_PRIORITIES = [
  'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug',
] as const

export interface LogLines {
  /** Chronological (oldest-first) order, matching journalctl's own
   * default - the same order a human reads a log top-to-bottom. */
  lines: string[]
  /** True when more lines existed than were requested and the oldest
   * ones were cut off - the fetched lines are a tail, not the whole
   * log. */
  truncated: boolean
}

export interface GetLogsParams {
  /** One of: 'system', 'firewall', 'ssh', 'https', 'dhcp-server',
   * 'vpn', 'frr', 'facility', 'priority', 'container' - see the
   * backend's `fixedLogSources` map for the fixed ones; 'facility'/
   * 'priority'/'container' additionally require their matching
   * parameter below. */
  source: string
  facility?: string
  priority?: string
  container?: string
  /** Defaults to 500 server-side if omitted; clamped to [1, 5000]. */
  lines?: number
}

/** Fetches a bounded "last N lines" snapshot of one of this app's
 * curated log sources. There's no incremental/`--since` fetch mode in
 * VyOS's op-mode command set (see docs/architecture.md) - every call
 * re-fetches the same window from scratch; useLogs.ts's auto-poll mode
 * is what turns successive snapshots into an appending tail. */
export function getLogs(params: GetLogsParams): Promise<LogLines> {
  return apiRequest<LogLines>('/api/logs', {
    query: {
      source: params.source,
      facility: params.facility,
      priority: params.priority,
      container: params.container,
      lines: params.lines !== undefined ? String(params.lines) : undefined,
    },
  })
}

export type ConfigOpKind = 'set' | 'delete' | 'comment'

export interface ConfigOp {
  op: ConfigOpKind
  path: string[]
  value?: string
}

export interface CommitResponse {
  pendingConfirm: boolean
}

/** Applies a batch of set/delete/comment operations as a single atomic
 * commit. If confirmSeconds > 0, VyOS starts a commit-confirm timer
 * (the "safe apply" mechanism): call confirmCommit before it expires,
 * or VyOS automatically reverts. */
export function commit(ops: ConfigOp[], confirmSeconds?: number): Promise<CommitResponse> {
  return apiRequest<CommitResponse>('/api/config/commit', {
    body: { ops, confirmSeconds: confirmSeconds || undefined },
  })
}

export function confirmCommit(): Promise<void> {
  return apiRequest<void>('/api/config/commit/confirm', { method: 'POST' })
}

/** Persists the current running configuration to disk (/config/config.boot
 * unless overridden). This is the app's "Save" action, independent of
 * Commit. */
export function save(file?: string): Promise<void> {
  return apiRequest<void>('/api/config/save', { body: { file: file || undefined } })
}

export type ImportMode = 'merge' | 'load'

/** Applies an uploaded configuration file - 'merge' overlays it onto
 * the current running config (nothing removed); 'load' fully replaces
 * the candidate config (can lock the caller out of the HTTPS API, and
 * therefore this app, if the file doesn't include a working `service
 * https` setup). Shares the same commit-confirm mechanism as commit()
 * - use confirmCommit() to confirm a pendingConfirm result here too,
 * VyOS treats it as the same underlying timer regardless of which
 * endpoint started it. */
export function importConfig(
  content: string,
  mode: ImportMode,
  confirmSeconds?: number,
): Promise<CommitResponse> {
  return apiRequest<CommitResponse>('/api/config/import', {
    body: { content, mode, confirmSeconds: confirmSeconds || undefined },
  })
}

export interface ContainerImage {
  id: string
  /** Whichever of podman's own "Names"/"RepoTags" fields was
   * populated (see backend/internal/vyos/container_image.go) -
   * `["<none>"]` for an untagged image. */
  tags: string[]
  sizeBytes: number
  containers: number
  /** Unix seconds - do `new Date(createdAt * 1000)` for a Date. */
  createdAt: number
}

export interface ContainerImagesResponse {
  images: ContainerImage[]
}

/** Locally-present container images (`show container image json`) -
 * distinct from the Container config pages' container/network/registry
 * definitions, which can reference an image that hasn't actually been
 * pulled onto the router yet. */
export function getContainerImages(): Promise<ContainerImagesResponse> {
  return apiRequest<ContainerImagesResponse>('/api/container/images')
}

export interface ContainerImageActionResponse {
  /** Whatever text VyOS's own script printed (pull progress/result,
   * often empty for a delete) - shown as-is, not reshaped. */
  message: string
}

/** Pulls (downloads) a container image onto the router - `add
 * container image <name>` (`podman image pull <name>`). Can
 * legitimately take several minutes for a large image over a slow
 * uplink; there's no progress reporting mid-flight (VyOS's own REST
 * endpoint is fully synchronous), just a single request that resolves
 * once the pull finishes or fails. */
export function pullContainerImage(name: string): Promise<ContainerImageActionResponse> {
  return apiRequest<ContainerImageActionResponse>('/api/container/images', { body: { name } })
}

/** Deletes a locally-present image - `delete container image <name>`.
 * VyOS itself refuses (with a descriptive error surfaced as-is) if the
 * image is currently in use by a running container. There is no
 * force-delete option: VyOS's REST API has no way to reach the CLI's
 * `... force` variant (see DeleteContainerImage's own doc comment on
 * the backend). */
export function deleteContainerImage(name: string): Promise<ContainerImageActionResponse> {
  return apiRequest<ContainerImageActionResponse>('/api/container/images', {
    method: 'DELETE',
    query: { name },
  })
}

/** One interface's live health-check state from `show wan-load-
 * balance` - distinct from `load-balancing wan interface-health
 * <ifname>` configuration, which the Config Tree/Load-balancing pages
 * read/write like anything else. LastStatusChange/LastSuccess/
 * LastFailure are kept exactly as VyOS's own op-mode script formatted
 * them (an absolute timestamp, "N/A", or a duration-since string like
 * "2:15:00.123456") rather than reparsed. */
export interface WANInterfaceStatus {
  interface: string
  active: boolean
  lastStatusChange: string
  lastSuccess: string
  lastFailure: string
  failures: number
}

export function getWANLoadBalanceStatus(): Promise<{ interfaces: WANInterfaceStatus[] }> {
  return apiRequest<{ interfaces: WANInterfaceStatus[] }>('/api/load-balancing/wan/status')
}

/** One row (a frontend, backend, or backend server) from `show
 * load-balancing haproxy` - VyOS's own op-mode script already
 * formats ReqRate/RespTime/LastChange with their units (e.g. "2 ms",
 * "23m54s"), kept as-is rather than reparsed. */
export interface HAProxyStatusRow {
  proxyName: string
  role: string
  status: string
  reqRate: string
  respTime: string
  lastChange: string
}

export function getHAProxyStatus(): Promise<{ rows: HAProxyStatusRow[] }> {
  return apiRequest<{ rows: HAProxyStatusRow[] }>('/api/load-balancing/haproxy/status')
}

/** One row of `show vrrp` - VyOS's own op-mode code already formats
 * Priority/LastTransition as display-ready strings (LastTransition is
 * a human-readable duration like "2s", not a timestamp), kept as-is. */
export interface VRRPGroupStatus {
  name: string
  interface: string
  vrid: string
  state: string
  priority: string
  lastTransition: string
}

export function getVRRPStatus(): Promise<{ groups: VRRPGroupStatus[] }> {
  return apiRequest<{ groups: VRRPGroupStatus[] }>('/api/high-availability/vrrp/status')
}

/** Parsed `show conntrack-sync status` - a fixed 4-line text block
 * with no JSON form (see the backend's ParseConntrackSyncStatus doc
 * comment). */
export interface ConntrackSyncStatus {
  syncInterfaces: string[]
  failoverMechanism: string
  syncGroup: string
  lastTransition: string
  expectSyncProtocols: string[]
}

export function getConntrackSyncStatus(): Promise<ConntrackSyncStatus> {
  return apiRequest<ConntrackSyncStatus>('/api/high-availability/conntrack-sync/status')
}

/** One row of `show qos shaper interface <ifname>`'s per-class stats
 * table - see the backend's ParseQosShaperStatus doc comment for the
 * important scope note (only interfaces with a `shaper`-type egress
 * policy have any data here at all). Bandwidth/MaxBw/Bytes are kept
 * exactly as VyOS's own op-mode script formatted them (e.g.
 * "1.000 Mb"). */
export interface QosShaperClassStats {
  class: string
  type: string
  bandwidth: string
  maxBw: string
  bytes: string
  packets: string
  drops: string
  queued: string
}

export interface QosShaperStatus {
  interface: string
  policyName: string
  classes: QosShaperClassStats[]
}

export function getQosShaperStatus(ifname: string): Promise<QosShaperStatus> {
  return apiRequest<QosShaperStatus>('/api/qos/shaper-status', { query: { interface: ifname } })
}

/** The closed set of directories the Files page will browse under -
 * matches the backend's own fileBrowserRoots exactly (served by
 * getFileBrowserRoots() below, not hardcoded here, unlike
 * LOG_FACILITIES/LOG_PRIORITIES - those are fixed, VyOS-version-
 * independent enums worth duplicating; the browsable roots are this
 * app's own choice, so fetching them keeps a single source of truth). */
export function getFileBrowserRoots(): Promise<{ roots: string[] }> {
  return apiRequest<{ roots: string[] }>('/api/files/roots')
}

export interface FileBrowserEntry {
  name: string
  isDir: boolean
  /** ls -hlFGL's permission string, e.g. "drwxr-xr-x" - shown as-is,
   * not reinterpreted. */
  permissions: string
  /** Human-readable, as `ls -h` printed it (e.g. "4.0K") - not a
   * precise byte count. */
  size: string
  /** As `ls` printed it (e.g. "Jan  1 00:00") - VyOS/`ls` omits the
   * year for anything from roughly the last 6 months, so this is
   * shown verbatim rather than guessed into a full date. */
  modified: string
  /** Set only for a symbolic link - the entry's other fields (isDir,
   * size, ...) already describe the link's *target* (`-L`
   * dereferences), not the link itself. */
  linkTarget?: string
}

/** Discriminated union (on isDirectory) of a directory listing
 * (entries populated) or a file view (every other optional field
 * populated) - GET /api/files returns whichever `show file <path>`
 * decided the path was. */
export interface FileBrowserResult {
  path: string
  isDirectory: boolean
  entries?: FileBrowserEntry[]
  type?: string
  owner?: string
  permissions?: string
  modified?: string
  isBinary?: boolean
  content?: string
  /** True when this file's content was cut short at the backend's own
   * size cap - VyOS's `show file` has no size limit of its own at
   * all, so a pathologically large file's full content/hexdump was
   * still generated server-side before being truncated down here. */
  truncated?: boolean
}

/** Views a file or lists a directory under one of the browsable roots
 * (see getFileBrowserRoots()) - `show file <path>`. Read-only: VyOS's
 * REST API has no supported way to write arbitrary file content back
 * to an arbitrary path, only importConfig()'s config.boot-specific,
 * schema-validated save/load/merge. */
export function getFile(path: string): Promise<FileBrowserResult> {
  return apiRequest<FileBrowserResult>('/api/files', { query: { path } })
}

/** One `pki certificate <name>`/`pki ca <name>`'s parsed validity
 * window - `notBefore`/`notAfter` are ISO-8601 strings (backend-parsed
 * from the stored certificate's X.509 fields, since certificate
 * expiry can't be determined from the raw config tree alone).
 * `notBefore`/`notAfter` are both absent (and `error` set instead)
 * when the entry has no certificate stored yet or it couldn't be
 * parsed - this app's PKI area allows creating a name before pasting
 * in its certificate PEM, so that's an expected, non-alarming case,
 * not shown as an error in the UI (see PKIExpiryBadge.tsx). */
export interface PKIExpiryEntry {
  name: string
  notBefore?: string
  notAfter?: string
  error?: string
}

export interface PKIExpiryResponse {
  certificates: PKIExpiryEntry[]
  cas: PKIExpiryEntry[]
}

/** Validity windows for every configured PKI certificate and CA -
 * parsed server-side from the same certificate PEM the generic
 * config-tree fetch already exposes unmasked (certificates aren't
 * masked, see pkiTypes.ts's own doc comment), since determining
 * expiry needs real X.509 parsing the frontend doesn't do itself. */
export function getPKIExpiry(): Promise<PKIExpiryResponse> {
  return apiRequest<PKIExpiryResponse>('/api/pki/expiry')
}
