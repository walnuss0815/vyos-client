import { dnsForwardingDomainPath, dnsForwardingPath } from './serviceDnsForwardingParse'
import type { DNSForwardingConfig, DNSForwardingDomain } from './serviceDnsForwardingTypes'
import type { ConfigOp } from './vyosApi'

export interface DNSForwardingSettingsFormValues {
  cacheSize: string
  dnssec: string
  ignoreHostsFile: boolean
  noServeRfc1918: boolean
  negativeTtl: string
  useSystemNameServers: boolean
  port: string
}

export function blankDNSForwardingSettingsFormValues(): DNSForwardingSettingsFormValues {
  return {
    cacheSize: '',
    dnssec: '',
    ignoreHostsFile: false,
    noServeRfc1918: false,
    negativeTtl: '',
    useSystemNameServers: false,
    port: '',
  }
}

export function dnsForwardingConfigToFormValues(config: DNSForwardingConfig): DNSForwardingSettingsFormValues {
  return {
    cacheSize: config.cacheSize ?? '',
    dnssec: config.dnssec ?? '',
    ignoreHostsFile: config.ignoreHostsFile,
    noServeRfc1918: config.noServeRfc1918,
    negativeTtl: config.negativeTtl ?? '',
    useSystemNameServers: config.useSystemNameServers,
    port: config.port ?? '',
  }
}

interface FlagField {
  get: (v: DNSForwardingSettingsFormValues) => boolean
  segment: string
}

const FLAG_FIELDS: FlagField[] = [
  { get: (v) => v.ignoreHostsFile, segment: 'ignore-hosts-file' },
  { get: (v) => v.noServeRfc1918, segment: 'no-serve-rfc1918' },
  { get: (v) => v.useSystemNameServers, segment: 'system' },
]

interface ScalarField {
  get: (v: DNSForwardingSettingsFormValues) => string
  segment: string
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.cacheSize, segment: 'cache-size' },
  { get: (v) => v.dnssec, segment: 'dnssec' },
  { get: (v) => v.negativeTtl, segment: 'negative-ttl' },
  { get: (v) => v.port, segment: 'port' },
]

/** Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps. */
export function dnsForwardingSettingsFormToOps(
  before: DNSForwardingConfig,
  values: DNSForwardingSettingsFormValues,
): ConfigOp[] {
  const beforeValues = dnsForwardingConfigToFormValues(before)
  const ops: ConfigOp[] = []

  for (const field of FLAG_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = dnsForwardingPath(field.segment)
    ops.push(newValue ? { op: 'set', path } : { op: 'delete', path })
  }

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = dnsForwardingPath(field.segment)
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  return ops
}

export function enableDNSForwardingOp(): ConfigOp {
  return { op: 'set', path: dnsForwardingPath() }
}

export function disableDNSForwardingOp(): ConfigOp {
  return { op: 'delete', path: dnsForwardingPath() }
}

// --- domains -------------------------------------------------------------

export interface DNSForwardingDomainFormValues {
  addnta: boolean
  recursionDesired: boolean
}

export function blankDNSForwardingDomainFormValues(): DNSForwardingDomainFormValues {
  return { addnta: false, recursionDesired: false }
}

export function dnsForwardingDomainToFormValues(domain: DNSForwardingDomain): DNSForwardingDomainFormValues {
  return { addnta: domain.addnta, recursionDesired: domain.recursionDesired }
}

export function dnsForwardingDomainFormToOps(
  fqdn: string,
  before: DNSForwardingDomain | undefined,
  values: DNSForwardingDomainFormValues,
): ConfigOp[] {
  const beforeValues = before ? dnsForwardingDomainToFormValues(before) : blankDNSForwardingDomainFormValues()
  const ops: ConfigOp[] = []
  const base = dnsForwardingDomainPath(fqdn)

  if (before === undefined) ops.push({ op: 'set', path: base })

  if (beforeValues.addnta !== values.addnta) {
    const path = [...base, 'addnta']
    ops.push(values.addnta ? { op: 'set', path } : { op: 'delete', path })
  }
  if (beforeValues.recursionDesired !== values.recursionDesired) {
    const path = [...base, 'recursion-desired']
    ops.push(values.recursionDesired ? { op: 'set', path } : { op: 'delete', path })
  }

  return ops
}

export function deleteDNSForwardingDomainOp(fqdn: string): ConfigOp {
  return { op: 'delete', path: dnsForwardingDomainPath(fqdn) }
}

// --- name servers (shared shape: top-level forwarders + per-domain) ------

/** Generic add/remove for a `name-server <address> [port <port>]`
 * tagNode - the exact same shape whether mounted at the top level
 * (system-wide forwarders) or under a specific `domain <fqdn>`, so
 * both call sites share these functions via an explicit `base` path,
 * rather than duplicating per mount point. */
export function addNameServerOps(base: string[], address: string, port: string): ConfigOp[] {
  const entryBase = [...base, address]
  const ops: ConfigOp[] = [{ op: 'set', path: entryBase }]
  if (port.trim()) ops.push({ op: 'set', path: [...entryBase, 'port'], value: port.trim() })
  return ops
}

export function removeNameServerOp(base: string[], address: string): ConfigOp {
  return { op: 'delete', path: [...base, address] }
}
