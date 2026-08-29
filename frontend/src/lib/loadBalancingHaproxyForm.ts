import {
  haproxyBackendPath,
  haproxyBackendRulePath,
  haproxyGlobalParametersPath,
  haproxyGlobalTimeoutPath,
  haproxyPath,
  haproxyServerPath,
  haproxyServicePath,
  haproxyServiceRulePath,
} from './loadBalancingParse'
import type {
  HAProxyBackend,
  HAProxyGlobalParameters,
  HAProxyGlobalTimeout,
  HAProxyLogging,
  HAProxyService,
} from './loadBalancingTypes'
import type { ConfigOp } from './vyosApi'

// --- shared: logging (facility + level), one per service/backend/global ---

export interface LoggingFormValues {
  loggingFacility: string
  loggingLevel: string
}

function loggingToFormValues(logging: HAProxyLogging): LoggingFormValues {
  return { loggingFacility: logging.facility ?? '', loggingLevel: logging.level }
}

/** logging's `facility <name> { level <lvl> }` is diffed as one unit
 * rather than field-by-field, since the facility name is a tagNode key
 * (not just a leaf value) - changing it means deleting the old
 * tagNode, not overwriting a value in place. */
function loggingOps(base: string[], before: LoggingFormValues, values: LoggingFormValues): ConfigOp[] {
  const ops: ConfigOp[] = []
  const oldFacility = before.loggingFacility.trim()
  const newFacility = values.loggingFacility.trim()
  const facilityListPath = [...base, 'logging', 'facility']

  if (oldFacility === newFacility) {
    // Same facility (including "neither set one") - only the level
    // might have changed.
    if (newFacility !== '' && before.loggingLevel !== values.loggingLevel) {
      ops.push({ op: 'set', path: [...facilityListPath, newFacility, 'level'], value: values.loggingLevel })
    }
    return ops
  }

  if (oldFacility !== '') ops.push({ op: 'delete', path: [...facilityListPath, oldFacility] })
  if (newFacility !== '') {
    ops.push({ op: 'set', path: [...facilityListPath, newFacility] })
    ops.push({ op: 'set', path: [...facilityListPath, newFacility, 'level'], value: values.loggingLevel })
  }
  return ops
}

// --- services (frontends) ---------------------------------------------

export interface HAProxyServiceFormValues extends LoggingFormValues {
  description: string
  mode: string
  port: string
  redirectHttpToHttps: boolean
  timeoutClient: string
  httpCompressionAlgorithm: string
  tcpRequestInspectDelay: string
}

export function blankHAProxyServiceFormValues(): HAProxyServiceFormValues {
  return {
    description: '',
    mode: 'http',
    port: '',
    redirectHttpToHttps: false,
    timeoutClient: '',
    httpCompressionAlgorithm: '',
    tcpRequestInspectDelay: '',
    loggingFacility: '',
    loggingLevel: 'err',
  }
}

export function haproxyServiceToFormValues(service: HAProxyService): HAProxyServiceFormValues {
  return {
    description: service.description ?? '',
    mode: service.mode,
    port: service.port !== undefined ? String(service.port) : '',
    redirectHttpToHttps: service.redirectHttpToHttps,
    timeoutClient: service.timeoutClient !== undefined ? String(service.timeoutClient) : '',
    httpCompressionAlgorithm: service.httpCompressionAlgorithm ?? '',
    tcpRequestInspectDelay: service.tcpRequestInspectDelay !== undefined ? String(service.tcpRequestInspectDelay) : '',
    ...loggingToFormValues(service.logging),
  }
}

export function haproxyServiceFormToOps(
  name: string,
  before: HAProxyService | undefined,
  values: HAProxyServiceFormValues,
): ConfigOp[] {
  const base = haproxyServicePath(name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })

  const beforeValues = before ? haproxyServiceToFormValues(before) : blankHAProxyServiceFormValues()

  const flagFields: { get: (v: HAProxyServiceFormValues) => boolean; segments: string[] }[] = [
    { get: (v) => v.redirectHttpToHttps, segments: ['redirect-http-to-https'] },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: HAProxyServiceFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.description, segments: ['description'] },
    { get: (v) => v.mode, segments: ['mode'] },
    { get: (v) => v.port, segments: ['port'] },
    { get: (v) => v.timeoutClient, segments: ['timeout', 'client'] },
    { get: (v) => v.httpCompressionAlgorithm, segments: ['http-compression', 'algorithm'] },
    { get: (v) => v.tcpRequestInspectDelay, segments: ['tcp-request', 'inspect-delay'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  ops.push(...loggingOps(base, beforeValues, values))
  return ops
}

export function deleteHAProxyServiceOp(name: string): ConfigOp {
  return { op: 'delete', path: haproxyServicePath(name) }
}

export function addHAProxyListenAddressOps(serviceName: string, address: string, acceptProxy: boolean): ConfigOp[] {
  const base = [...haproxyServicePath(serviceName), 'listen-address', address]
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (acceptProxy) ops.push({ op: 'set', path: [...base, 'accept-proxy'] })
  return ops
}

export function removeHAProxyListenAddressOp(serviceName: string, address: string): ConfigOp {
  return { op: 'delete', path: [...haproxyServicePath(serviceName), 'listen-address', address] }
}

export interface HAProxyRuleOptions {
  /** Comma-separated domain names - split client-side, matching how
   * this app's other "add one new sub-item" nested-list forms accept
   * plain scalar inputs rather than a full multi-value editor for a
   * not-yet-created row. */
  domainNames: string
  wildcardDomain: boolean
  ssl: string
  urlPathBegin: string
  urlPathEnd: string
  urlPathExact: string
  setRedirectLocation: string
  /** Only one of setBackend/setServer applies, depending on whether
   * this is a service (frontend) or backend rule. */
  setBackend: string
  setServer: string
}

function ruleOps(base: string[], options: HAProxyRuleOptions): ConfigOp[] {
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  const domains = options.domainNames
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d !== '')
  for (const domain of domains) ops.push({ op: 'set', path: [...base, 'domain-name'], value: domain })
  if (options.wildcardDomain) ops.push({ op: 'set', path: [...base, 'wildcard-domain'] })
  if (options.ssl) ops.push({ op: 'set', path: [...base, 'ssl'], value: options.ssl })
  if (options.urlPathBegin) ops.push({ op: 'set', path: [...base, 'url-path', 'begin'], value: options.urlPathBegin })
  if (options.urlPathEnd) ops.push({ op: 'set', path: [...base, 'url-path', 'end'], value: options.urlPathEnd })
  if (options.urlPathExact) ops.push({ op: 'set', path: [...base, 'url-path', 'exact'], value: options.urlPathExact })
  if (options.setRedirectLocation) {
    ops.push({ op: 'set', path: [...base, 'set', 'redirect-location'], value: options.setRedirectLocation })
  }
  if (options.setBackend) ops.push({ op: 'set', path: [...base, 'set', 'backend'], value: options.setBackend })
  if (options.setServer) ops.push({ op: 'set', path: [...base, 'set', 'server'], value: options.setServer })
  return ops
}

export function addHAProxyServiceRuleOps(serviceName: string, ruleId: string, options: HAProxyRuleOptions): ConfigOp[] {
  return ruleOps(haproxyServiceRulePath(serviceName, ruleId), options)
}

export function removeHAProxyServiceRuleOp(serviceName: string, ruleId: string): ConfigOp {
  return { op: 'delete', path: haproxyServiceRulePath(serviceName, ruleId) }
}

export function addHAProxyBackendRuleOps(backendName: string, ruleId: string, options: HAProxyRuleOptions): ConfigOp[] {
  return ruleOps(haproxyBackendRulePath(backendName, ruleId), options)
}

export function removeHAProxyBackendRuleOp(backendName: string, ruleId: string): ConfigOp {
  return { op: 'delete', path: haproxyBackendRulePath(backendName, ruleId) }
}

// --- backends ------------------------------------------------------------

export interface HAProxyBackendFormValues extends LoggingFormValues {
  balance: string
  description: string
  mode: string
  httpCheckMethod: string
  httpCheckUri: string
  httpCheckExpectStatus: string
  httpCheckExpectString: string
  healthCheck: string
  httpServerClose: boolean
  sslCaCertificate: string
  sslNoVerify: boolean
  timeoutCheck: string
  timeoutConnect: string
  timeoutServer: string
  timeoutTunnel: string
}

export function blankHAProxyBackendFormValues(): HAProxyBackendFormValues {
  return {
    balance: 'round-robin',
    description: '',
    mode: 'http',
    httpCheckMethod: '',
    httpCheckUri: '',
    httpCheckExpectStatus: '',
    httpCheckExpectString: '',
    healthCheck: '',
    httpServerClose: false,
    sslCaCertificate: '',
    sslNoVerify: false,
    timeoutCheck: '',
    timeoutConnect: '',
    timeoutServer: '',
    timeoutTunnel: '',
    loggingFacility: '',
    loggingLevel: 'err',
  }
}

export function haproxyBackendToFormValues(backend: HAProxyBackend): HAProxyBackendFormValues {
  return {
    balance: backend.balance,
    description: backend.description ?? '',
    mode: backend.mode,
    httpCheckMethod: backend.httpCheckMethod ?? '',
    httpCheckUri: backend.httpCheckUri ?? '',
    httpCheckExpectStatus: backend.httpCheckExpectStatus !== undefined ? String(backend.httpCheckExpectStatus) : '',
    httpCheckExpectString: backend.httpCheckExpectString ?? '',
    healthCheck: backend.healthCheck ?? '',
    httpServerClose: backend.httpServerClose,
    sslCaCertificate: backend.sslCaCertificate ?? '',
    sslNoVerify: backend.sslNoVerify,
    timeoutCheck: backend.timeoutCheck !== undefined ? String(backend.timeoutCheck) : '',
    timeoutConnect: backend.timeoutConnect !== undefined ? String(backend.timeoutConnect) : '',
    timeoutServer: backend.timeoutServer !== undefined ? String(backend.timeoutServer) : '',
    timeoutTunnel: backend.timeoutTunnel !== undefined ? String(backend.timeoutTunnel) : '',
    ...loggingToFormValues(backend.logging),
  }
}

export function haproxyBackendFormToOps(
  name: string,
  before: HAProxyBackend | undefined,
  values: HAProxyBackendFormValues,
): ConfigOp[] {
  const base = haproxyBackendPath(name)
  const ops: ConfigOp[] = []
  if (before === undefined) ops.push({ op: 'set', path: base })

  const beforeValues = before ? haproxyBackendToFormValues(before) : blankHAProxyBackendFormValues()

  const flagFields: { get: (v: HAProxyBackendFormValues) => boolean; segments: string[] }[] = [
    { get: (v) => v.httpServerClose, segments: ['http-server-close'] },
    { get: (v) => v.sslNoVerify, segments: ['ssl', 'no-verify'] },
  ]
  for (const field of flagFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  const scalarFields: { get: (v: HAProxyBackendFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.balance, segments: ['balance'] },
    { get: (v) => v.description, segments: ['description'] },
    { get: (v) => v.mode, segments: ['mode'] },
    { get: (v) => v.httpCheckMethod, segments: ['http-check', 'method'] },
    { get: (v) => v.httpCheckUri, segments: ['http-check', 'uri'] },
    { get: (v) => v.httpCheckExpectStatus, segments: ['http-check', 'expect', 'status'] },
    { get: (v) => v.httpCheckExpectString, segments: ['http-check', 'expect', 'string'] },
    { get: (v) => v.healthCheck, segments: ['health-check'] },
    { get: (v) => v.sslCaCertificate, segments: ['ssl', 'ca-certificate'] },
    { get: (v) => v.timeoutCheck, segments: ['timeout', 'check'] },
    { get: (v) => v.timeoutConnect, segments: ['timeout', 'connect'] },
    { get: (v) => v.timeoutServer, segments: ['timeout', 'server'] },
    { get: (v) => v.timeoutTunnel, segments: ['timeout', 'tunnel'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  ops.push(...loggingOps(base, beforeValues, values))
  return ops
}

export function deleteHAProxyBackendOp(name: string): ConfigOp {
  return { op: 'delete', path: haproxyBackendPath(name) }
}

export interface HAProxyServerOptions {
  address: string
  port: string
  backup: boolean
  checkPort: string
  sendProxy: boolean
  sendProxyV2: boolean
}

export function addHAProxyServerOps(backendName: string, serverName: string, options: HAProxyServerOptions): ConfigOp[] {
  const base = haproxyServerPath(backendName, serverName)
  const ops: ConfigOp[] = [{ op: 'set', path: base }]
  if (options.address) ops.push({ op: 'set', path: [...base, 'address'], value: options.address })
  if (options.port) ops.push({ op: 'set', path: [...base, 'port'], value: options.port })
  if (options.backup) ops.push({ op: 'set', path: [...base, 'backup'] })
  if (options.checkPort) ops.push({ op: 'set', path: [...base, 'check', 'port'], value: options.checkPort })
  if (options.sendProxy) ops.push({ op: 'set', path: [...base, 'send-proxy'] })
  if (options.sendProxyV2) ops.push({ op: 'set', path: [...base, 'send-proxy-v2'] })
  return ops
}

export function removeHAProxyServerOp(backendName: string, serverName: string): ConfigOp {
  return { op: 'delete', path: haproxyServerPath(backendName, serverName) }
}

// --- global parameters / timeout / vrf ------------------------------------

export interface HAProxyGlobalParametersFormValues extends LoggingFormValues {
  maxConnections: string
  tlsVersionMin: string
}

export function haproxyGlobalParametersToFormValues(params: HAProxyGlobalParameters): HAProxyGlobalParametersFormValues {
  return {
    maxConnections: params.maxConnections !== undefined ? String(params.maxConnections) : '',
    tlsVersionMin: params.tlsVersionMin,
    ...loggingToFormValues(params.logging),
  }
}

export function haproxyGlobalParametersFormToOps(
  before: HAProxyGlobalParametersFormValues,
  values: HAProxyGlobalParametersFormValues,
): ConfigOp[] {
  const base = haproxyGlobalParametersPath()
  const ops: ConfigOp[] = []
  const scalarFields: { get: (v: HAProxyGlobalParametersFormValues) => string; segments: string[] }[] = [
    { get: (v) => v.maxConnections, segments: ['max-connections'] },
    { get: (v) => v.tlsVersionMin, segments: ['tls-version-min'] },
  ]
  for (const field of scalarFields) {
    const oldValue = field.get(before)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  ops.push(...loggingOps(base, before, values))
  return ops
}

export interface HAProxyGlobalTimeoutFormValues {
  check: string
  connect: string
  client: string
  server: string
  tunnel: string
}

export function haproxyGlobalTimeoutToFormValues(timeout: HAProxyGlobalTimeout): HAProxyGlobalTimeoutFormValues {
  return {
    check: String(timeout.check),
    connect: String(timeout.connect),
    client: String(timeout.client),
    server: String(timeout.server),
    tunnel: String(timeout.tunnel),
  }
}

export function haproxyGlobalTimeoutFormToOps(
  before: HAProxyGlobalTimeoutFormValues,
  values: HAProxyGlobalTimeoutFormValues,
): ConfigOp[] {
  const base = haproxyGlobalTimeoutPath()
  const ops: ConfigOp[] = []
  const fields: (keyof HAProxyGlobalTimeoutFormValues)[] = ['check', 'connect', 'client', 'server', 'tunnel']
  for (const field of fields) {
    const oldValue = before[field]
    const newValue = values[field]
    if (oldValue === newValue) continue
    const path = [...base, field]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }
  return ops
}

export function setHAProxyVrfOp(value: string): ConfigOp {
  const path = haproxyPath('vrf')
  return value.trim() === '' ? { op: 'delete', path } : { op: 'set', path, value: value.trim() }
}
