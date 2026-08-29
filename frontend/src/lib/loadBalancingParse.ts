import {
  type HAProxyBackend,
  type HAProxyConfig,
  type HAProxyGlobalParameters,
  type HAProxyGlobalTimeout,
  type HAProxyHttpResponseHeader,
  type HAProxyListenAddress,
  type HAProxyLogging,
  type HAProxyMode,
  type HAProxyRule,
  type HAProxyServer,
  type HAProxyService,
  type LoadBalancingConfig,
  type WANConfig,
  type WANHealthTest,
  type WANHealthTestType,
  type WANInterfaceHealth,
  type WANMatch,
  type WANRule,
  type WANRuleLimit,
} from './loadBalancingTypes'

// --- generic VyOS JSON-tree helpers (mirrors firewallParse.ts's own
// copy - each area's parser keeps its own small set rather than
// sharing one, matching this app's existing convention) -------------

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

function numberOrUndefined(v: unknown): number | undefined {
  const s = asString(v)
  if (s === undefined) return undefined
  const n = Number(s)
  // Number.isFinite, not just !Number.isNaN: Number("Infinity") and
  // Number("-Infinity") are both legitimate finite-looking JS numeric
  // conversions of a non-numeric string, which isNaN alone lets
  // through as a "valid" value for a field like priority/cost/
  // bandwidth that should never actually be infinite.
  return Number.isFinite(n) ? n : undefined
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

// --- WAN load-balancing ------------------------------------------------

export function wanPath(...rest: string[]): string[] {
  return ['load-balancing', 'wan', ...rest]
}

export function wanInterfaceHealthPath(ifname: string, ...rest: string[]): string[] {
  return [...wanPath('interface-health'), ifname, ...rest]
}

export function wanHealthTestPath(ifname: string, testId: string, ...rest: string[]): string[] {
  return [...wanInterfaceHealthPath(ifname), 'test', testId, ...rest]
}

export function wanRulePath(ruleId: string, ...rest: string[]): string[] {
  return [...wanPath('rule'), ruleId, ...rest]
}

export function wanRuleInterfacePath(ruleId: string, ifaceName: string, ...rest: string[]): string[] {
  return [...wanRulePath(ruleId), 'interface', ifaceName, ...rest]
}

function parseWANMatch(raw: unknown): WANMatch {
  const groupRoot = child(raw, 'group')
  return {
    address: asString(child(raw, 'address')),
    port: asString(child(raw, 'port')),
    addressGroup: asString(child(groupRoot, 'address-group')),
    networkGroup: asString(child(groupRoot, 'network-group')),
    portGroup: asString(child(groupRoot, 'port-group')),
    domainGroup: asString(child(groupRoot, 'domain-group')),
  }
}

function parseWANHealthTest(id: string, raw: unknown): WANHealthTest {
  return {
    id,
    type: (asString(child(raw, 'type')) as WANHealthTestType | undefined) ?? 'ping',
    target: asString(child(raw, 'target')),
    testScript: asString(child(raw, 'test-script')),
    respTime: numberOrUndefined(child(raw, 'resp-time')) ?? 5,
    ttlLimit: numberOrUndefined(child(raw, 'ttl-limit')) ?? 1,
  }
}

function parseWANInterfaceHealth(ifname: string, raw: unknown): WANInterfaceHealth {
  const testRoot = child(raw, 'test')
  const tests = isRecord(testRoot)
    ? Object.entries(testRoot)
        .map(([id, t]) => parseWANHealthTest(id, t))
        .sort((a, b) => Number(a.id) - Number(b.id))
    : []
  return {
    interface: ifname,
    nexthop: asString(child(raw, 'nexthop')),
    failureCount: numberOrUndefined(child(raw, 'failure-count')) ?? 1,
    successCount: numberOrUndefined(child(raw, 'success-count')) ?? 1,
    tests,
  }
}

function parseWANRuleLimit(raw: unknown): WANRuleLimit | undefined {
  if (!isRecord(raw)) return undefined
  return {
    rate: numberOrUndefined(child(raw, 'rate')) ?? 5,
    period: asString(child(raw, 'period')) ?? 'second',
    burst: numberOrUndefined(child(raw, 'burst')) ?? 5,
    threshold: asString(child(raw, 'threshold')) ?? 'below',
  }
}

function parseWANRule(id: string, raw: unknown): WANRule {
  const ifaceRoot = child(raw, 'interface')
  const interfaces = isRecord(ifaceRoot)
    ? Object.entries(ifaceRoot).map(([name, v]) => ({
        name,
        weight: numberOrUndefined(child(v, 'weight')) ?? 1,
      }))
    : []
  return {
    id,
    description: asString(child(raw, 'description')),
    source: parseWANMatch(child(raw, 'source')),
    destination: parseWANMatch(child(raw, 'destination')),
    exclude: isFlagPresent(raw, 'exclude'),
    failover: isFlagPresent(raw, 'failover'),
    inboundInterface: asString(child(raw, 'inbound-interface')),
    interfaces,
    limit: parseWANRuleLimit(child(raw, 'limit')),
    perPacketBalancing: isFlagPresent(raw, 'per-packet-balancing'),
    protocol: asString(child(raw, 'protocol')) ?? 'all',
  }
}

export function parseWANConfig(wan: unknown): WANConfig {
  const healthRoot = child(wan, 'interface-health')
  const interfaceHealth = isRecord(healthRoot)
    ? Object.entries(healthRoot).map(([ifname, v]) => parseWANInterfaceHealth(ifname, v))
    : []

  const ruleRoot = child(wan, 'rule')
  const rules = isRecord(ruleRoot)
    ? Object.entries(ruleRoot)
        .map(([id, v]) => parseWANRule(id, v))
        .sort((a, b) => Number(a.id) - Number(b.id))
    : []

  return {
    disableSourceNat: isFlagPresent(wan, 'disable-source-nat'),
    enableLocalTraffic: isFlagPresent(wan, 'enable-local-traffic'),
    flushConnections: isFlagPresent(wan, 'flush-connections'),
    onlyDefaultRoute: isFlagPresent(wan, 'only-default-route'),
    hook: asString(child(wan, 'hook')),
    stickyInbound: isFlagPresent(child(wan, 'sticky-connections'), 'inbound'),
    interfaceHealth,
    rules,
  }
}

// --- HAProxy -------------------------------------------------------------

export function haproxyPath(...rest: string[]): string[] {
  return ['load-balancing', 'haproxy', ...rest]
}

export function haproxyServicePath(name: string, ...rest: string[]): string[] {
  return [...haproxyPath('service'), name, ...rest]
}

export function haproxyBackendPath(name: string, ...rest: string[]): string[] {
  return [...haproxyPath('backend'), name, ...rest]
}

export function haproxyServerPath(backendName: string, serverName: string, ...rest: string[]): string[] {
  return [...haproxyBackendPath(backendName), 'server', serverName, ...rest]
}

export function haproxyServiceRulePath(serviceName: string, ruleId: string, ...rest: string[]): string[] {
  return [...haproxyServicePath(serviceName), 'rule', ruleId, ...rest]
}

export function haproxyBackendRulePath(backendName: string, ruleId: string, ...rest: string[]): string[] {
  return [...haproxyBackendPath(backendName), 'rule', ruleId, ...rest]
}

export function haproxyGlobalParametersPath(...rest: string[]): string[] {
  return [...haproxyPath('global-parameters'), ...rest]
}

export function haproxyGlobalTimeoutPath(...rest: string[]): string[] {
  return [...haproxyPath('timeout'), ...rest]
}

/** `logging { facility <name> { level <lvl> } }` - a tagNode in the
 * XML, but only the first entry is modeled (see loadBalancingTypes.ts's
 * HAProxyLogging doc comment on why one facility/level is the
 * practical limit). */
function parseHAProxyLogging(raw: unknown): HAProxyLogging {
  const facilityRoot = child(raw, 'facility')
  if (!isRecord(facilityRoot)) return { level: 'err' }
  const entry = Object.entries(facilityRoot)[0]
  if (!entry) return { level: 'err' }
  const [facility, v] = entry
  return { facility, level: asString(child(v, 'level')) ?? 'err' }
}

function parseHTTPResponseHeaders(raw: unknown): HAProxyHttpResponseHeader[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw).map(([id, v]) => ({ id, value: asString(child(v, 'value')) ?? '' }))
}

function parseHAProxyRule(id: string, raw: unknown, kind: 'service' | 'backend'): HAProxyRule {
  const urlPath = child(raw, 'url-path')
  const setNode = child(raw, 'set')
  return {
    id,
    domainNames: asArray(child(raw, 'domain-name')),
    wildcardDomain: isFlagPresent(raw, 'wildcard-domain'),
    ssl: asString(child(raw, 'ssl')),
    urlPathBegin: asArray(child(urlPath, 'begin')),
    urlPathEnd: asArray(child(urlPath, 'end')),
    urlPathExact: asArray(child(urlPath, 'exact')),
    setRedirectLocation: asString(child(setNode, 'redirect-location')),
    setBackend: kind === 'service' ? asString(child(setNode, 'backend')) : undefined,
    setServer: kind === 'backend' ? asString(child(setNode, 'server')) : undefined,
  }
}

function parseHAProxyRules(raw: unknown, kind: 'service' | 'backend'): HAProxyRule[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw)
    .map(([id, v]) => parseHAProxyRule(id, v, kind))
    .sort((a, b) => Number(a.id) - Number(b.id))
}

function parseListenAddresses(raw: unknown): HAProxyListenAddress[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw).map(([address, v]) => ({
    address,
    acceptProxy: isFlagPresent(v, 'accept-proxy'),
  }))
}

function parseHAProxyService(name: string, raw: unknown): HAProxyService {
  const tcpRequest = child(raw, 'tcp-request')
  const timeout = child(raw, 'timeout')
  const httpCompression = child(raw, 'http-compression')
  const ssl = child(raw, 'ssl')
  return {
    name,
    backends: asArray(child(raw, 'backend')),
    description: asString(child(raw, 'description')),
    listenAddresses: parseListenAddresses(child(raw, 'listen-address')),
    logging: parseHAProxyLogging(child(raw, 'logging')),
    mode: (asString(child(raw, 'mode')) as HAProxyMode | undefined) ?? 'http',
    port: numberOrUndefined(child(raw, 'port')),
    rules: parseHAProxyRules(child(raw, 'rule'), 'service'),
    tcpRequestInspectDelay: numberOrUndefined(child(tcpRequest, 'inspect-delay')),
    httpResponseHeaders: parseHTTPResponseHeaders(child(raw, 'http-response-headers')),
    redirectHttpToHttps: isFlagPresent(raw, 'redirect-http-to-https'),
    timeoutClient: numberOrUndefined(child(timeout, 'client')),
    httpCompressionAlgorithm: asString(child(httpCompression, 'algorithm')),
    httpCompressionMimeTypes: asArray(child(httpCompression, 'mime-type')),
    sslCertificates: asArray(child(ssl, 'certificate')),
  }
}

function parseServers(raw: unknown): HAProxyServer[] {
  if (!isRecord(raw)) return []
  return Object.entries(raw).map(([name, v]) => ({
    name,
    address: asString(child(v, 'address')),
    backup: isFlagPresent(v, 'backup'),
    checkPort: numberOrUndefined(child(child(v, 'check'), 'port')),
    port: numberOrUndefined(child(v, 'port')),
    sendProxy: isFlagPresent(v, 'send-proxy'),
    sendProxyV2: isFlagPresent(v, 'send-proxy-v2'),
  }))
}

function parseHAProxyBackend(name: string, raw: unknown): HAProxyBackend {
  const httpCheck = child(raw, 'http-check')
  const expect = child(httpCheck, 'expect')
  const timeout = child(raw, 'timeout')
  const ssl = child(raw, 'ssl')
  return {
    name,
    balance: asString(child(raw, 'balance')) ?? 'round-robin',
    description: asString(child(raw, 'description')),
    logging: parseHAProxyLogging(child(raw, 'logging')),
    mode: (asString(child(raw, 'mode')) as HAProxyMode | undefined) ?? 'http',
    httpResponseHeaders: parseHTTPResponseHeaders(child(raw, 'http-response-headers')),
    httpCheckMethod: asString(child(httpCheck, 'method')),
    httpCheckUri: asString(child(httpCheck, 'uri')),
    httpCheckExpectStatus: numberOrUndefined(child(expect, 'status')),
    httpCheckExpectString: asString(child(expect, 'string')),
    healthCheck: asString(child(raw, 'health-check')),
    httpServerClose: isFlagPresent(raw, 'http-server-close'),
    rules: parseHAProxyRules(child(raw, 'rule'), 'backend'),
    servers: parseServers(child(raw, 'server')),
    sslCaCertificate: asString(child(ssl, 'ca-certificate')),
    sslNoVerify: isFlagPresent(ssl, 'no-verify'),
    timeoutCheck: numberOrUndefined(child(timeout, 'check')),
    timeoutConnect: numberOrUndefined(child(timeout, 'connect')),
    timeoutServer: numberOrUndefined(child(timeout, 'server')),
    timeoutTunnel: numberOrUndefined(child(timeout, 'tunnel')),
  }
}

function parseGlobalParameters(raw: unknown): HAProxyGlobalParameters {
  return {
    logging: parseHAProxyLogging(child(raw, 'logging')),
    maxConnections: numberOrUndefined(child(raw, 'max-connections')),
    sslBindCiphers: asArray(child(raw, 'ssl-bind-ciphers')),
    tlsVersionMin: asString(child(raw, 'tls-version-min')) ?? '1.3',
  }
}

function parseGlobalTimeout(raw: unknown): HAProxyGlobalTimeout {
  return {
    check: numberOrUndefined(child(raw, 'check')) ?? 5,
    connect: numberOrUndefined(child(raw, 'connect')) ?? 10,
    client: numberOrUndefined(child(raw, 'client')) ?? 50,
    server: numberOrUndefined(child(raw, 'server')) ?? 50,
    tunnel: numberOrUndefined(child(raw, 'tunnel')) ?? 300,
  }
}

export function parseHAProxyConfig(haproxy: unknown): HAProxyConfig {
  const serviceRoot = child(haproxy, 'service')
  const services = isRecord(serviceRoot)
    ? Object.entries(serviceRoot)
        .map(([n, v]) => parseHAProxyService(n, v))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  const backendRoot = child(haproxy, 'backend')
  const backends = isRecord(backendRoot)
    ? Object.entries(backendRoot)
        .map(([n, v]) => parseHAProxyBackend(n, v))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  return {
    services,
    backends,
    globalParameters: parseGlobalParameters(child(haproxy, 'global-parameters')),
    globalTimeout: parseGlobalTimeout(child(haproxy, 'timeout')),
    vrf: asString(child(haproxy, 'vrf')),
  }
}

export function parseLoadBalancingConfig(raw: unknown): LoadBalancingConfig {
  return {
    wan: parseWANConfig(child(raw, 'wan')),
    haproxy: parseHAProxyConfig(child(raw, 'haproxy')),
  }
}
