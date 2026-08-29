/**
 * Typed, UI-friendly shapes for VyOS's `load-balancing wan` (WAN
 * failover/multi-uplink) and `load-balancing haproxy` (TCP/HTTP
 * reverse-proxy) config trees. See loadBalancingParse.ts for the raw
 * VyOS JSON -> these shapes conversion, and loadBalancingWanForm.ts/
 * loadBalancingHaproxyForm.ts for the reverse (form values -> ConfigOp
 * path arrays for the pending-changes cart).
 *
 * Confirmed directly against vyos-1x's interface-definitions/
 * load-balancing_wan.xml.in and load-balancing_haproxy.xml.in (and
 * their #include fragments), not docs.vyos.io alone - a few fields
 * present in the live schema (`only-default-route`, HAProxy backend
 * `timeout tunnel`/`http-server-close`) are recent enough that
 * docs.vyos.io doesn't document them yet; they're still modeled here
 * since they're real, validated CLI nodes.
 *
 * Not modeled (still fully editable via the Config Tree page): WAN's
 * `hook` script path is included (a single scalar), but HAProxy's
 * `logging` sub-node's facility/level is deliberately reduced to "one
 * facility, one level" per service/backend/global-parameters (matching
 * what the XML actually allows - `logging facility <name>` is a single
 * tagNode entry per parent, not a list, despite the tagNode shape).
 */

// --- WAN load-balancing ------------------------------------------------

/** Source/destination match fields shared by WAN rules - the same
 * `group { address-group | network-group | domain-group | port-group
 * }` + address/port shape as Firewall/NAT's own match blocks (see
 * firewallTypes.ts's FirewallMatch), minus MAC matching (WAN LB's
 * `source-destination-group-ipv4.xml.i` include doesn't offer it) -
 * kept as its own type rather than reusing FirewallMatch, matching how
 * NAT already has its own NATMatch instead of sharing one either. */
export interface WANMatch {
  address?: string
  port?: string
  addressGroup?: string
  networkGroup?: string
  portGroup?: string
  domainGroup?: string
}

export const WAN_HEALTH_TEST_TYPES = ['ping', 'ttl', 'user-defined'] as const
export type WANHealthTestType = (typeof WAN_HEALTH_TEST_TYPES)[number]

export interface WANHealthTest {
  id: string
  type: WANHealthTestType
  target?: string
  testScript?: string
  /** Seconds, 1-30. Defaults to 5 if never set. */
  respTime: number
  /** Hop count, 1-254. Defaults to 1 if never set. */
  ttlLimit: number
}

export interface WANInterfaceHealth {
  interface: string
  /** IPv4 address or the literal "dhcp". */
  nexthop?: string
  /** 1-10, defaults to 1. */
  failureCount: number
  /** 1-10, defaults to 1. */
  successCount: number
  tests: WANHealthTest[]
}

export interface WANRuleInterface {
  name: string
  /** 1-255, defaults to 1. */
  weight: number
}

export interface WANRuleLimit {
  rate: number
  period: 'hour' | 'minute' | 'second' | string
  burst: number
  threshold: 'above' | 'below' | string
}

export interface WANRule {
  id: string
  description?: string
  source: WANMatch
  destination: WANMatch
  exclude: boolean
  failover: boolean
  inboundInterface?: string
  interfaces: WANRuleInterface[]
  limit?: WANRuleLimit
  perPacketBalancing: boolean
  /** Protocol name/number/"all"/"tcp_udp". Defaults to "all". */
  protocol: string
}

export interface WANConfig {
  disableSourceNat: boolean
  enableLocalTraffic: boolean
  flushConnections: boolean
  onlyDefaultRoute: boolean
  hook?: string
  stickyInbound: boolean
  interfaceHealth: WANInterfaceHealth[]
  rules: WANRule[]
}

// --- HAProxy -------------------------------------------------------------

export const HAPROXY_MODES = ['http', 'tcp'] as const
export type HAProxyMode = (typeof HAPROXY_MODES)[number]

export const HAPROXY_LOG_FACILITIES = [
  'auth', 'cron', 'daemon', 'kern', 'lpr', 'mail', 'news', 'syslog', 'user', 'uucp',
  'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7',
] as const

export const HAPROXY_LOG_LEVELS = [
  'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug',
] as const

export interface HAProxyLogging {
  facility?: string
  /** Defaults to "err" if a facility is set but a level never was. */
  level: string
}

/** `http-response-headers <name> { value <v> }` - shape matches
 * KeyValuePairList.tsx's own `{id, value}` item type exactly (id here
 * is the header name), so both service and backend forms reuse that
 * component directly rather than a bespoke one. */
export interface HAProxyHttpResponseHeader {
  id: string
  value: string
}

export interface HAProxyListenAddress {
  address: string
  acceptProxy: boolean
}

/** A frontend (`service`) or backend routing rule - same match
 * vocabulary, differing only in what `set` can target (a service rule
 * can set a backend name to route to; a backend rule can set a
 * specific server name instead). */
export interface HAProxyRule {
  id: string
  domainNames: string[]
  wildcardDomain: boolean
  ssl?: string
  urlPathBegin: string[]
  urlPathEnd: string[]
  urlPathExact: string[]
  setRedirectLocation?: string
  /** Only meaningful on a service (frontend) rule. */
  setBackend?: string
  /** Only meaningful on a backend rule. */
  setServer?: string
}

export interface HAProxyService {
  name: string
  backends: string[]
  description?: string
  listenAddresses: HAProxyListenAddress[]
  logging: HAProxyLogging
  mode: HAProxyMode
  port?: number
  rules: HAProxyRule[]
  /** Milliseconds, 1-65535. */
  tcpRequestInspectDelay?: number
  httpResponseHeaders: HAProxyHttpResponseHeader[]
  redirectHttpToHttps: boolean
  /** Seconds, 1-3600 - overrides the global timeout.client default;
   * unset means "use the global default" (there's no default baked
   * into this per-service field itself, only the global one - see
   * HAProxyGlobalTimeout). */
  timeoutClient?: number
  httpCompressionAlgorithm?: string
  httpCompressionMimeTypes: string[]
  sslCertificates: string[]
}

export const HAPROXY_BALANCE_ALGORITHMS = ['source-address', 'round-robin', 'least-connection'] as const

export const HAPROXY_HTTP_CHECK_METHODS = ['options', 'head', 'get', 'post', 'put'] as const

export const HAPROXY_HEALTH_CHECK_TYPES = ['ldap', 'mysql', 'pgsql', 'redis', 'smtp'] as const

export interface HAProxyServer {
  name: string
  address?: string
  backup: boolean
  /** Overrides the health-check port; defaults to `port` if unset. */
  checkPort?: number
  port?: number
  sendProxy: boolean
  sendProxyV2: boolean
}

export interface HAProxyBackend {
  name: string
  /** Defaults to "round-robin" if never set. */
  balance: string
  description?: string
  logging: HAProxyLogging
  mode: HAProxyMode
  httpResponseHeaders: HAProxyHttpResponseHeader[]
  httpCheckMethod?: string
  httpCheckUri?: string
  httpCheckExpectStatus?: number
  httpCheckExpectString?: string
  /** Non-HTTP L7 check type - mutually exclusive with the http-check
   * fields above and only valid when mode is "tcp" (VyOS-side
   * validation, not enforced client-side beyond the form hiding the
   * irrelevant fields). */
  healthCheck?: string
  httpServerClose: boolean
  rules: HAProxyRule[]
  servers: HAProxyServer[]
  sslCaCertificate?: string
  sslNoVerify: boolean
  /** Seconds, 1-3600 (tunnel is 1-86400) - each overrides the matching
   * global timeout default when set; unset means "use the global
   * default" (see HAProxyService.timeoutClient's doc comment for the
   * same "no per-item default" nuance). */
  timeoutCheck?: number
  timeoutConnect?: number
  timeoutServer?: number
  timeoutTunnel?: number
}

export const HAPROXY_TLS_VERSIONS = ['1.2', '1.3'] as const

export const HAPROXY_SSL_CIPHERS = [
  'ecdhe-ecdsa-aes128-gcm-sha256', 'ecdhe-rsa-aes128-gcm-sha256',
  'ecdhe-ecdsa-aes256-gcm-sha384', 'ecdhe-rsa-aes256-gcm-sha384',
  'ecdhe-ecdsa-chacha20-poly1305', 'ecdhe-rsa-chacha20-poly1305',
  'dhe-rsa-aes128-gcm-sha256', 'dhe-rsa-aes256-gcm-sha384',
] as const

export interface HAProxyGlobalParameters {
  logging: HAProxyLogging
  maxConnections?: number
  /** Defaults to all 8 HAPROXY_SSL_CIPHERS if never set. */
  sslBindCiphers: string[]
  /** Defaults to "1.3" if never set. */
  tlsVersionMin: string
}

/** The actual, always-applied defaults every haproxy.cfg gets - unlike
 * HAProxyService.timeoutClient/HAProxyBackend.timeoutCheck etc., which
 * only take effect when explicitly set (see those fields' own doc
 * comments), these five genuinely have VyOS-side defaults regardless
 * of whether the user ever touches this node at all. */
export interface HAProxyGlobalTimeout {
  check: number
  connect: number
  client: number
  server: number
  tunnel: number
}

export interface HAProxyConfig {
  services: HAProxyService[]
  backends: HAProxyBackend[]
  globalParameters: HAProxyGlobalParameters
  globalTimeout: HAProxyGlobalTimeout
  vrf?: string
}

export interface LoadBalancingConfig {
  wan: WANConfig
  haproxy: HAProxyConfig
}
