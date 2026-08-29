import { describe, expect, it } from 'vitest'
import {
  addZabbixServerActiveOps,
  blankFrrExporterFormValues,
  blankNetworkEventFormValues,
  blankNodeExporterFormValues,
  blankZabbixAgentFormValues,
  disableFrrExporterOp,
  disableNodeExporterOp,
  disableZabbixAgentOp,
  enableFrrExporterOp,
  enableNodeExporterOp,
  enableZabbixAgentOp,
  frrExporterFormToOps,
  networkEventFormToOps,
  nodeExporterFormToOps,
  removeZabbixServerActiveOp,
  zabbixAgentFormToOps,
} from './serviceMonitoringForm'
import {
  blankNetworkEventConfig,
  blankPrometheusFrrExporterConfig,
  blankPrometheusNodeExporterConfig,
  blankZabbixAgentConfig,
} from './serviceMonitoringTypes'

describe('nodeExporterFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(nodeExporterFormToOps(blankPrometheusNodeExporterConfig(), blankNodeExporterFormValues())).toEqual([])
  })

  it('queues flag and scalar fields', () => {
    const values = blankNodeExporterFormValues()
    values.collectTextfile = true
    values.port = '9200'

    expect(nodeExporterFormToOps(blankPrometheusNodeExporterConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'monitoring', 'prometheus', 'node-exporter', 'collectors', 'textfile'] },
      { op: 'set', path: ['service', 'monitoring', 'prometheus', 'node-exporter', 'port'], value: '9200' },
    ])
  })
})

describe('enableNodeExporterOp / disableNodeExporterOp', () => {
  it('builds the expected ops', () => {
    expect(enableNodeExporterOp()).toEqual({
      op: 'set',
      path: ['service', 'monitoring', 'prometheus', 'node-exporter'],
    })
    expect(disableNodeExporterOp()).toEqual({
      op: 'delete',
      path: ['service', 'monitoring', 'prometheus', 'node-exporter'],
    })
  })
})

describe('frrExporterFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(frrExporterFormToOps(blankPrometheusFrrExporterConfig(), blankFrrExporterFormValues())).toEqual([])
  })

  it('queues bgp collector flags and peer-description', () => {
    const values = blankFrrExporterFormValues()
    values.collectBgpAcceptFilteredPrefixes = true
    values.collectBgpPeerDescription = 'plain-text'

    expect(frrExporterFormToOps(blankPrometheusFrrExporterConfig(), values)).toEqual([
      {
        op: 'set',
        path: ['service', 'monitoring', 'prometheus', 'frr-exporter', 'collector', 'bgp', 'accept-filtered-prefixes'],
      },
      {
        op: 'set',
        path: ['service', 'monitoring', 'prometheus', 'frr-exporter', 'collector', 'bgp', 'peer-description'],
        value: 'plain-text',
      },
    ])
  })
})

describe('enableFrrExporterOp / disableFrrExporterOp', () => {
  it('builds the expected ops', () => {
    expect(enableFrrExporterOp()).toEqual({
      op: 'set',
      path: ['service', 'monitoring', 'prometheus', 'frr-exporter'],
    })
    expect(disableFrrExporterOp()).toEqual({
      op: 'delete',
      path: ['service', 'monitoring', 'prometheus', 'frr-exporter'],
    })
  })
})

describe('zabbixAgentFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(zabbixAgentFormToOps(blankZabbixAgentConfig(), blankZabbixAgentFormValues())).toEqual([])
  })

  it('queues host-name and log flags', () => {
    const values = blankZabbixAgentFormValues()
    values.hostName = 'router1'
    values.logRemoteCommands = true

    expect(zabbixAgentFormToOps(blankZabbixAgentConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'monitoring', 'zabbix-agent', 'log', 'remote-commands'] },
      { op: 'set', path: ['service', 'monitoring', 'zabbix-agent', 'host-name'], value: 'router1' },
    ])
  })

  it('sets authentication mode and writes only the plaintext psk secret when a PSK id/secret is given', () => {
    const values = blankZabbixAgentFormValues()
    values.pskId = 'router1'
    values.pskSecret = 'super-secret-psk'

    const ops = zabbixAgentFormToOps(blankZabbixAgentConfig(), values)
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['service', 'monitoring', 'zabbix-agent', 'authentication', 'psk', 'id'], value: 'router1' },
        { op: 'set', path: ['service', 'monitoring', 'zabbix-agent', 'authentication', 'mode'], value: 'pre-shared-secret' },
        {
          op: 'set',
          path: ['service', 'monitoring', 'zabbix-agent', 'authentication', 'psk', 'secret'],
          value: 'super-secret-psk',
        },
      ]),
    )
  })

  it('never queues anything for the psk secret when left blank', () => {
    const before = { ...blankZabbixAgentConfig(), hasPskSecret: true }
    expect(zabbixAgentFormToOps(before, blankZabbixAgentFormValues())).toEqual([])
  })
})

describe('enableZabbixAgentOp / disableZabbixAgentOp', () => {
  it('builds the expected ops', () => {
    expect(enableZabbixAgentOp()).toEqual({ op: 'set', path: ['service', 'monitoring', 'zabbix-agent'] })
    expect(disableZabbixAgentOp()).toEqual({ op: 'delete', path: ['service', 'monitoring', 'zabbix-agent'] })
  })
})

describe('zabbix server-active ops', () => {
  it('always sets the tag, plus port when given', () => {
    expect(addZabbixServerActiveOps('192.0.2.2', '10052')).toEqual([
      { op: 'set', path: ['service', 'monitoring', 'zabbix-agent', 'server-active', '192.0.2.2'] },
      { op: 'set', path: ['service', 'monitoring', 'zabbix-agent', 'server-active', '192.0.2.2', 'port'], value: '10052' },
    ])
  })

  it('builds a remove op', () => {
    expect(removeZabbixServerActiveOp('192.0.2.2')).toEqual({
      op: 'delete',
      path: ['service', 'monitoring', 'zabbix-agent', 'server-active', '192.0.2.2'],
    })
  })
})

describe('networkEventFormToOps', () => {
  it('queues nothing for a blank diff', () => {
    expect(networkEventFormToOps(blankNetworkEventConfig(), blankNetworkEventFormValues())).toEqual([])
  })

  it('queues event flags and scalar fields', () => {
    const values = blankNetworkEventFormValues()
    values.eventRoute = true
    values.queueSize = '5000'

    expect(networkEventFormToOps(blankNetworkEventConfig(), values)).toEqual([
      { op: 'set', path: ['service', 'monitoring', 'network-event', 'event', 'route'] },
      { op: 'set', path: ['service', 'monitoring', 'network-event', 'queue-size'], value: '5000' },
    ])
  })
})
