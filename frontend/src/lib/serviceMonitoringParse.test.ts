import { describe, expect, it } from 'vitest'
import {
  monitoringPath,
  networkEventPath,
  parseMonitoringConfig,
  prometheusFrrExporterPath,
  prometheusNodeExporterPath,
  zabbixAgentPath,
  zabbixServerActivePath,
} from './serviceMonitoringParse'

describe('parseMonitoringConfig', () => {
  it('returns blank, disabled sub-configs when absent', () => {
    const config = parseMonitoringConfig(undefined)
    expect(config.prometheusNodeExporter.enabled).toBe(false)
    expect(config.prometheusFrrExporter.enabled).toBe(false)
    expect(config.zabbixAgent.enabled).toBe(false)
    expect(config.networkEvent.enabled).toBe(false)
  })

  it('parses node-exporter independently enabled by its own node presence', () => {
    const monitoring = {
      prometheus: { 'node-exporter': { port: '9200', vrf: 'RED', collectors: { textfile: {} } } },
    }
    const config = parseMonitoringConfig(monitoring)
    expect(config.prometheusNodeExporter).toEqual({
      enabled: true,
      listenAddresses: [],
      port: '9200',
      vrf: 'RED',
      collectTextfile: true,
    })
    expect(config.prometheusFrrExporter.enabled).toBe(false)
  })

  it('parses frr-exporter collector flags and bgp sub-fields', () => {
    const monitoring = {
      prometheus: {
        'frr-exporter': {
          collector: {
            bgp: { 'accept-filtered-prefixes': {}, 'peer-description': 'plain-text' },
            'bgp-l2-vpn': {},
            'ospf-instance': ['1', '2'],
            pim: {},
            'detailed-routes': {},
          },
        },
      },
    }
    const config = parseMonitoringConfig(monitoring)
    expect(config.prometheusFrrExporter).toMatchObject({
      enabled: true,
      collectBgpAcceptFilteredPrefixes: true,
      collectBgpPeerDescription: 'plain-text',
      collectBgpL2Vpn: true,
      collectOspfInstances: ['1', '2'],
      collectPim: true,
      collectDetailedRoutes: true,
    })
  })

  it('parses zabbix-agent, masking the psk secret', () => {
    const monitoring = {
      'zabbix-agent': {
        authentication: { mode: 'pre-shared-secret', psk: { id: 'router1', secret: 'super-secret-psk' } },
        'host-name': 'router1',
        server: ['192.0.2.1'],
        'server-active': { '192.0.2.2': { port: '10052' } },
      },
    }
    const config = parseMonitoringConfig(monitoring)
    expect(config.zabbixAgent.enabled).toBe(true)
    expect(config.zabbixAgent.authMode).toBe('pre-shared-secret')
    expect(config.zabbixAgent.pskId).toBe('router1')
    expect(config.zabbixAgent.hasPskSecret).toBe(true)
    expect(config.zabbixAgent.servers).toEqual(['192.0.2.1'])
    expect(config.zabbixAgent.serverActive).toEqual([{ address: '192.0.2.2', port: '10052' }])
    expect(JSON.stringify(config)).not.toContain('super-secret-psk')
  })

  it('parses network-event flags and settings', () => {
    const monitoring = {
      'network-event': { event: { route: {}, link: {} }, 'queue-size': '5000', 'log-level': 'debug' },
    }
    const config = parseMonitoringConfig(monitoring)
    expect(config.networkEvent).toEqual({
      enabled: true,
      eventRoute: true,
      eventLink: true,
      eventAddr: false,
      eventNeigh: false,
      eventRule: false,
      queueSize: '5000',
      logLevel: 'debug',
    })
  })
})

describe('path builders', () => {
  it('builds base and prometheus exporter paths', () => {
    expect(monitoringPath('prometheus')).toEqual(['service', 'monitoring', 'prometheus'])
    expect(prometheusNodeExporterPath('port')).toEqual([
      'service',
      'monitoring',
      'prometheus',
      'node-exporter',
      'port',
    ])
    expect(prometheusFrrExporterPath('port')).toEqual([
      'service',
      'monitoring',
      'prometheus',
      'frr-exporter',
      'port',
    ])
  })

  it('builds zabbix-agent and server-active paths', () => {
    expect(zabbixAgentPath('port')).toEqual(['service', 'monitoring', 'zabbix-agent', 'port'])
    expect(zabbixServerActivePath('192.0.2.2', 'port')).toEqual([
      'service',
      'monitoring',
      'zabbix-agent',
      'server-active',
      '192.0.2.2',
      'port',
    ])
  })

  it('builds a network-event path', () => {
    expect(networkEventPath('queue-size')).toEqual(['service', 'monitoring', 'network-event', 'queue-size'])
  })
})
