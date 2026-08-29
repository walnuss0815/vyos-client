/**
 * Typed, UI-friendly shape for a curated core of `service dns
 * forwarding`. Confirmed against vyos-1x's own interface-definition
 * XML source (`interface-definitions/service_dns_forwarding.xml.in`,
 * ~1025 lines - one of VyOS's larger config-tree areas).
 *
 * Scoped to a curated core, not full coverage: `cache-size`, `dhcp`,
 * `dnssec`, `domain` (per-domain forwarders), `allow-from`,
 * `listen-address`, `ignore-hosts-file`, `no-serve-rfc1918`,
 * `negative-ttl`, the top-level `name-server` (system-wide upstream
 * forwarders), `system` (use `/etc/resolv.conf`), `source-address`,
 * and `port` (this service's own listen port).
 *
 * Deliberately excludes (still editable via Config Tree):
 * `authoritative-domain` - a full mini authoritative DNS zone/records
 * feature (A/AAAA/CNAME/MX/NS/PTR/TXT/SPF/SRV/NAPTR records with their
 * own sub-structure) that's really a separate product surface from
 * "forward my LAN's DNS queries upstream", not a smaller version of
 * it. Also excludes `zone-cache` (AXFR/URL zone mirroring),
 * `dns64-prefix` (NAT64 helper), `options` (ECS/EDNS subnet
 * allow-list tuning), and several other advanced tuning leaves
 * (`serve-stale-extension`, `ttl-percent`, `nothing-below-nxdomain`,
 * `minimum-ttl-override`, `timeout`, `exclude-throttle-address`).
 *
 * Two same-named-but-different-depth gotchas confirmed against the
 * XML, kept distinct here rather than collapsed into one shape:
 * `DNSForwardingConfig.port` (this service's own listen port, default
 * 53) is NOT the same as `DNSForwardingNameServer.port` (the port to
 * query *that specific* upstream server on, also default 53) - two
 * different leaves at two different depths that happen to share a
 * name and default. Also, the top-level `name-server` (system-wide
 * forwarders) and a `domain <fqdn>`'s own `name-server` are the exact
 * same shape (`DNSForwardingNameServer`, itself a tagNode keyed by IP
 * with a `port` child) but serve different purposes - modeled as the
 * same reusable type, mounted at two places.
 */

export const DNS_FORWARDING_DNSSEC_MODES = [
  'off',
  'process-no-validate',
  'process',
  'log-fail',
  'validate',
] as const

export interface DNSForwardingNameServer {
  address: string
  /** Defaults to '53' in VyOS if unset. */
  port?: string
}

export interface DNSForwardingDomain {
  fqdn: string
  nameServers: DNSForwardingNameServer[]
  addnta: boolean
  recursionDesired: boolean
}

export function blankDNSForwardingDomain(): Omit<DNSForwardingDomain, 'fqdn'> {
  return { nameServers: [], addnta: false, recursionDesired: false }
}

export interface DNSForwardingConfig {
  /** Whether `service dns forwarding` exists at all in the tree. */
  enabled: boolean
  /** Defaults to '10000' in VyOS if unset. */
  cacheSize?: string
  dhcpInterfaces: string[]
  /** Defaults to 'process-no-validate' in VyOS if unset. */
  dnssec?: string
  domains: DNSForwardingDomain[]
  allowFrom: string[]
  listenAddresses: string[]
  ignoreHostsFile: boolean
  noServeRfc1918: boolean
  /** Defaults to '3600' in VyOS if unset. */
  negativeTtl?: string
  /** System-wide upstream forwarders (top-level `name-server`, not to
   * be confused with a specific domain's own forwarders). */
  forwarders: DNSForwardingNameServer[]
  /** Use `/etc/resolv.conf` (the `system` valueless leaf). */
  useSystemNameServers: boolean
  sourceAddresses: string[]
  /** This service's own listen port. Defaults to '53' in VyOS if
   * unset - see this file's doc comment on why this is a distinct
   * field from DNSForwardingNameServer.port. */
  port?: string
}

export function blankDNSForwardingConfig(): DNSForwardingConfig {
  return {
    enabled: false,
    dhcpInterfaces: [],
    domains: [],
    allowFrom: [],
    listenAddresses: [],
    ignoreHostsFile: false,
    noServeRfc1918: false,
    forwarders: [],
    useSystemNameServers: false,
    sourceAddresses: [],
  }
}
