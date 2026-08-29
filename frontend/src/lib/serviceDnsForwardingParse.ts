import {
  blankDNSForwardingConfig,
  blankDNSForwardingDomain,
  type DNSForwardingConfig,
  type DNSForwardingDomain,
  type DNSForwardingNameServer,
} from './serviceDnsForwardingTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/containerParse.ts's
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

function entries(node: unknown): [string, unknown][] {
  return isRecord(node) ? Object.entries(node) : []
}

function parseNameServers(root: unknown): DNSForwardingNameServer[] {
  return entries(root)
    .map(([address, raw]): DNSForwardingNameServer => ({ address, port: asString(child(raw, 'port')) }))
    .sort((a, b) => a.address.localeCompare(b.address))
}

function parseDomain(fqdn: string, raw: unknown): DNSForwardingDomain {
  return {
    fqdn,
    ...blankDNSForwardingDomain(),
    nameServers: parseNameServers(child(raw, 'name-server')),
    addnta: isFlagPresent(raw, 'addnta'),
    recursionDesired: isFlagPresent(raw, 'recursion-desired'),
  }
}

export function parseDNSForwardingConfig(forwarding: unknown): DNSForwardingConfig {
  if (forwarding === undefined) return blankDNSForwardingConfig()
  return {
    enabled: true,
    cacheSize: asString(child(forwarding, 'cache-size')),
    dhcpInterfaces: asStringArray(child(forwarding, 'dhcp')),
    dnssec: asString(child(forwarding, 'dnssec')),
    domains: entries(child(forwarding, 'domain'))
      .map(([fqdn, raw]) => parseDomain(fqdn, raw))
      .sort((a, b) => a.fqdn.localeCompare(b.fqdn)),
    allowFrom: asStringArray(child(forwarding, 'allow-from')),
    listenAddresses: asStringArray(child(forwarding, 'listen-address')),
    ignoreHostsFile: isFlagPresent(forwarding, 'ignore-hosts-file'),
    noServeRfc1918: isFlagPresent(forwarding, 'no-serve-rfc1918'),
    negativeTtl: asString(child(forwarding, 'negative-ttl')),
    forwarders: parseNameServers(child(forwarding, 'name-server')),
    useSystemNameServers: isFlagPresent(forwarding, 'system'),
    sourceAddresses: asStringArray(child(forwarding, 'source-address')),
    port: asString(child(forwarding, 'port')),
  }
}

// --- path builders -----------------------------------------------------

export function dnsForwardingPath(...rest: string[]): string[] {
  return ['service', 'dns', 'forwarding', ...rest]
}

export function dnsForwardingDomainPath(fqdn: string, ...rest: string[]): string[] {
  return dnsForwardingPath('domain', fqdn, ...rest)
}

export function dnsForwardingForwarderPath(address: string, ...rest: string[]): string[] {
  return dnsForwardingPath('name-server', address, ...rest)
}

export function dnsForwardingDomainNameServerPath(fqdn: string, address: string, ...rest: string[]): string[] {
  return dnsForwardingDomainPath(fqdn, 'name-server', address, ...rest)
}
