/**
 * Typed, UI-friendly shape for a curated slice of `service
 * monitoring`. Confirmed against vyos-1x's own interface-definition
 * XML source (`interface-definitions/service_monitoring_
 * prometheus.xml.in`/`_zabbix-agent.xml.in`/`_network_event.xml.in`).
 *
 * Scoped to three of the four `service monitoring` sub-areas:
 * - **Prometheus** (`service monitoring prometheus`): only
 *   `node-exporter` and `frr-exporter`, each independently enabled by
 *   its own node's presence (same "presence enables" pattern as SSH/
 *   HTTPS/SNMP elsewhere in this app). Excludes `blackbox-exporter`
 *   (a nested 2-level keyed list of synthetic-monitoring "modules" -
 *   niche, disproportionate to add here).
 * - **Zabbix Agent** (`service monitoring zabbix-agent`): full
 *   coverage.
 * - **Network Events** (`service monitoring network-event`): full
 *   coverage, the simplest of the four.
 *
 * Deliberately excludes **Telegraf** (`service monitoring telegraf`)
 * entirely - 5 structurally distinct backend integrations (InfluxDB,
 * Azure Data Explorer, Loki, Prometheus-client, Splunk), each with
 * its own auth shape, disproportionate alongside the three simpler
 * areas covered here. Telegraf remains fully Config-Tree-only.
 */

export const PROMETHEUS_PEER_DESCRIPTION_FORMATS = ['json', 'plain-text'] as const

export interface PrometheusNodeExporterConfig {
  /** Whether `service monitoring prometheus node-exporter` exists at
   * all in the tree. */
  enabled: boolean
  listenAddresses: string[]
  /** Defaults to '9100' in VyOS if unset. */
  port?: string
  vrf?: string
  collectTextfile: boolean
}

export function blankPrometheusNodeExporterConfig(): PrometheusNodeExporterConfig {
  return { enabled: false, listenAddresses: [], collectTextfile: false }
}

export interface PrometheusFrrExporterConfig {
  /** Whether `service monitoring prometheus frr-exporter` exists at
   * all in the tree. */
  enabled: boolean
  listenAddresses: string[]
  /** Defaults to '9342' in VyOS if unset. */
  port?: string
  vrf?: string
  collectBgpAcceptFilteredPrefixes: boolean
  collectBgpAdvertisedPrefixes: boolean
  /** Defaults to 'json' in VyOS if unset. */
  collectBgpPeerDescription?: string
  collectBgpPeerGroup: boolean
  collectBgpPeerHostname: boolean
  collectBgpPeerType: boolean
  collectBgpL2Vpn: boolean
  collectOspfInstances: string[]
  collectPim: boolean
  collectDetailedRoutes: boolean
}

export function blankPrometheusFrrExporterConfig(): PrometheusFrrExporterConfig {
  return {
    enabled: false,
    listenAddresses: [],
    collectBgpAcceptFilteredPrefixes: false,
    collectBgpAdvertisedPrefixes: false,
    collectBgpPeerGroup: false,
    collectBgpPeerHostname: false,
    collectBgpPeerType: false,
    collectBgpL2Vpn: false,
    collectOspfInstances: [],
    collectPim: false,
    collectDetailedRoutes: false,
  }
}

export const ZABBIX_DEBUG_LEVELS = ['basic', 'critical', 'error', 'warning', 'debug', 'extended-debug'] as const

export interface ZabbixServerActive {
  address: string
  /** Per-server port override. */
  port?: string
}

export interface ZabbixAgentConfig {
  /** Whether `service monitoring zabbix-agent` exists at all in the
   * tree. */
  enabled: boolean
  /** Only value VyOS's schema currently offers. */
  authMode?: string
  pskId?: string
  /** Write-only, like every other masked credential in this app -
   * matches shared/sensitive-fields.json's generic "secret" entry. */
  hasPskSecret: boolean
  directory?: string
  hostName?: string
  /** Defaults to '5' in VyOS if unset. */
  bufferFlushInterval?: string
  /** Defaults to '100' in VyOS if unset. */
  bufferSize?: string
  /** Defaults to 'warning' in VyOS if unset. */
  debugLevel?: string
  logRemoteCommands: boolean
  /** Defaults to '0' (unlimited) in VyOS if unset. */
  logSize?: string
  listenAddresses: string[]
  /** Defaults to '10050' in VyOS if unset. */
  port?: string
  /** Flat multi-valued leaf - just addresses, no per-server config
   * (contrast with `serverActive` below, a genuine tagNode). */
  servers: string[]
  serverActive: ZabbixServerActive[]
  /** Defaults to '3' in VyOS if unset. */
  timeout?: string
  vrf?: string
}

export function blankZabbixAgentConfig(): ZabbixAgentConfig {
  return {
    enabled: false,
    hasPskSecret: false,
    logRemoteCommands: false,
    listenAddresses: [],
    servers: [],
    serverActive: [],
  }
}

export const NETWORK_EVENT_LOG_LEVELS = ['info', 'debug'] as const

export interface NetworkEventConfig {
  /** Whether `service monitoring network-event` exists at all in the
   * tree. */
  enabled: boolean
  eventRoute: boolean
  eventLink: boolean
  eventAddr: boolean
  eventNeigh: boolean
  eventRule: boolean
  /** Enforced range is 1-2147483647 - VyOS's own `valueHelp` text
   * (100-2147483647) is stale/inconsistent with the actual
   * `<validator>` constraint, confirmed against the XML directly. */
  queueSize?: string
  logLevel?: string
}

export function blankNetworkEventConfig(): NetworkEventConfig {
  return { enabled: false, eventRoute: false, eventLink: false, eventAddr: false, eventNeigh: false, eventRule: false }
}

export interface MonitoringConfig {
  prometheusNodeExporter: PrometheusNodeExporterConfig
  prometheusFrrExporter: PrometheusFrrExporterConfig
  zabbixAgent: ZabbixAgentConfig
  networkEvent: NetworkEventConfig
}

export function blankMonitoringConfig(): MonitoringConfig {
  return {
    prometheusNodeExporter: blankPrometheusNodeExporterConfig(),
    prometheusFrrExporter: blankPrometheusFrrExporterConfig(),
    zabbixAgent: blankZabbixAgentConfig(),
    networkEvent: blankNetworkEventConfig(),
  }
}
