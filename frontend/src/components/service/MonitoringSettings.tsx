import { useState } from 'react'
import ChipList from '../ChipList'
import {
  prometheusFrrExporterPath,
  prometheusNodeExporterPath,
  zabbixAgentPath,
} from '../../lib/serviceMonitoringParse'
import {
  addZabbixServerActiveOps,
  blankFrrExporterFormValues,
  blankNetworkEventFormValues,
  blankNodeExporterFormValues,
  blankZabbixAgentFormValues,
  disableFrrExporterOp,
  disableNetworkEventOp,
  disableNodeExporterOp,
  disableZabbixAgentOp,
  enableFrrExporterOp,
  enableNetworkEventOp,
  enableNodeExporterOp,
  enableZabbixAgentOp,
  frrExporterConfigToFormValues,
  frrExporterFormToOps,
  networkEventConfigToFormValues,
  networkEventFormToOps,
  nodeExporterConfigToFormValues,
  nodeExporterFormToOps,
  removeZabbixServerActiveOp,
  zabbixAgentConfigToFormValues,
  zabbixAgentFormToOps,
} from '../../lib/serviceMonitoringForm'
import {
  NETWORK_EVENT_LOG_LEVELS,
  PROMETHEUS_PEER_DESCRIPTION_FORMATS,
  ZABBIX_DEBUG_LEVELS,
  type MonitoringConfig,
} from '../../lib/serviceMonitoringTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function MonitoringSettings({ config }: { config: MonitoringConfig }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
          Prometheus: Node Exporter
        </h2>
        <NodeExporterSection config={config} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
          Prometheus: FRR Exporter
        </h2>
        <FrrExporterSection config={config} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Zabbix Agent</h2>
        <ZabbixAgentSection config={config} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Network Events</h2>
        <NetworkEventSection config={config} />
      </div>
    </div>
  )
}

function NodeExporterSection({ config }: { config: MonitoringConfig }) {
  const nodeExporter = config.prometheusNodeExporter
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState(() => nodeExporterConfigToFormValues(nodeExporter))

  if (!nodeExporter.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">Node Exporter is not configured.</p>
        <button
          onClick={() => {
            const op = enableNodeExporterOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable Node Exporter
        </button>
      </div>
    )
  }

  function update<K extends keyof ReturnType<typeof blankNodeExporterFormValues>>(
    key: K,
    value: ReturnType<typeof blankNodeExporterFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = nodeExporterFormToOps(nodeExporter, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDisable() {
    const op = disableNodeExporterOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Port
          <input {...noExtensionInputProps} value={values.port} onChange={(e) => update('port', e.target.value)} placeholder="9100" className={inputClass} />
        </label>
        <label className={labelClass}>
          VRF
          <input {...noExtensionInputProps} value={values.vrf} onChange={(e) => update('vrf', e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={values.collectTextfile} onChange={(e) => update('collectTextfile', e.target.checked)} className="accent-accent-500" />
        Collect textfile metrics
        <InfoTooltip text="Also exposes any custom metric files dropped in the exporter's textfile directory - lets scripts publish their own values alongside the built-in system metrics." />
      </label>
      <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Save settings
      </button>
      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">Listen addresses</p>
        <ChipList values={nodeExporter.listenAddresses} basePath={prometheusNodeExporterPath()} leaf="listen-address" pathLabel="service monitoring prometheus node-exporter listen-address" placeholder="192.0.2.1" />
      </div>
      <button onClick={queueDisable} className="mt-3 text-xs text-danger-500 hover:text-danger-400">
        Disable Node Exporter
      </button>
    </div>
  )
}

function FrrExporterSection({ config }: { config: MonitoringConfig }) {
  const frrExporter = config.prometheusFrrExporter
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState(() => frrExporterConfigToFormValues(frrExporter))

  if (!frrExporter.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">FRR Exporter is not configured.</p>
        <button
          onClick={() => {
            const op = enableFrrExporterOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable FRR Exporter
        </button>
      </div>
    )
  }

  function update<K extends keyof ReturnType<typeof blankFrrExporterFormValues>>(
    key: K,
    value: ReturnType<typeof blankFrrExporterFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = frrExporterFormToOps(frrExporter, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDisable() {
    const op = disableFrrExporterOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Port
          <input {...noExtensionInputProps} value={values.port} onChange={(e) => update('port', e.target.value)} placeholder="9342" className={inputClass} />
        </label>
        <label className={labelClass}>
          VRF
          <input {...noExtensionInputProps} value={values.vrf} onChange={(e) => update('vrf', e.target.value)} className={inputClass} />
        </label>
        <FieldLabel
          label="BGP peer description format"
          hint="How the free-text neighbor description configured on the BGP tab is encoded into exported label values - json expects structured key/value pairs, text passes it through as-is."
        >
          <select value={values.collectBgpPeerDescription} onChange={(e) => update('collectBgpPeerDescription', e.target.value)} className={inputClass}>
            <option value="">Default (json)</option>
            {PROMETHEUS_PEER_DESCRIPTION_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.collectBgpAcceptFilteredPrefixes} onChange={(e) => update('collectBgpAcceptFilteredPrefixes', e.target.checked)} className="accent-accent-500" />
          BGP accepted/filtered prefixes
          <InfoTooltip text="Exposes per-neighbor counts of prefixes that passed vs. were dropped by inbound route-map/filter policy." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.collectBgpAdvertisedPrefixes} onChange={(e) => update('collectBgpAdvertisedPrefixes', e.target.checked)} className="accent-accent-500" />
          BGP advertised prefixes
          <InfoTooltip text="Exposes per-neighbor counts of prefixes this router is sending out, the outbound counterpart to the accepted/filtered metric above." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.collectBgpPeerGroup} onChange={(e) => update('collectBgpPeerGroup', e.target.checked)} className="accent-accent-500" />
          BGP peer group
          <InfoTooltip text="Adds the configured peer-group name as an extra label on BGP metrics, making it easy to aggregate stats across peers that share a template." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.collectBgpPeerHostname} onChange={(e) => update('collectBgpPeerHostname', e.target.checked)} className="accent-accent-500" />
          BGP peer hostname
          <InfoTooltip text="Resolves and attaches each neighbor's DNS hostname as a metric label, in addition to its bare IP address." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.collectBgpPeerType} onChange={(e) => update('collectBgpPeerType', e.target.checked)} className="accent-accent-500" />
          BGP peer type
          <InfoTooltip text="Labels each neighbor as internal (iBGP) or external (eBGP) based on whether its remote AS matches this router's own." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.collectBgpL2Vpn} onChange={(e) => update('collectBgpL2Vpn', e.target.checked)} className="accent-accent-500" />
          BGP L2VPN
          <InfoTooltip text="Includes metrics for EVPN/L2VPN address-family sessions, not just standard unicast BGP." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.collectPim} onChange={(e) => update('collectPim', e.target.checked)} className="accent-accent-500" />
          PIM
          <InfoTooltip text="Exposes multicast routing (Protocol Independent Multicast) statistics from FRR, unrelated to the BGP options above." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.collectDetailedRoutes} onChange={(e) => update('collectDetailedRoutes', e.target.checked)} className="accent-accent-500" />
          Detailed routes
          <InfoTooltip text="Exports a metric per individual route rather than just aggregate route-table counts - substantially increases the number of exported time series on routers with large tables." />
        </label>
      </div>
      <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Save settings
      </button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs text-slate-500">Listen addresses</p>
          <ChipList values={frrExporter.listenAddresses} basePath={prometheusFrrExporterPath()} leaf="listen-address" pathLabel="service monitoring prometheus frr-exporter listen-address" placeholder="192.0.2.1" />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">OSPF instances</p>
          <ChipList values={frrExporter.collectOspfInstances} basePath={prometheusFrrExporterPath('collector')} leaf="ospf-instance" pathLabel="service monitoring prometheus frr-exporter collector ospf-instance" placeholder="1" />
        </div>
      </div>
      <button onClick={queueDisable} className="mt-3 text-xs text-danger-500 hover:text-danger-400">
        Disable FRR Exporter
      </button>
    </div>
  )
}

function ZabbixAgentSection({ config }: { config: MonitoringConfig }) {
  const zabbix = config.zabbixAgent
  const add = usePendingChangesStore((s) => s.add)

  if (!zabbix.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">Zabbix Agent is not configured.</p>
        <button
          onClick={() => {
            const op = enableZabbixAgentOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable Zabbix Agent
        </button>
      </div>
    )
  }

  return <ZabbixAgentForm zabbix={zabbix} />
}

function ZabbixAgentForm({ zabbix }: { zabbix: MonitoringConfig['zabbixAgent'] }) {
  const [values, setValues] = useState(() => zabbixAgentConfigToFormValues(zabbix))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankZabbixAgentFormValues>>(
    key: K,
    value: ReturnType<typeof blankZabbixAgentFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = zabbixAgentFormToOps(zabbix, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDisable() {
    const op = disableZabbixAgentOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Host name
          <input {...noExtensionInputProps} value={values.hostName} onChange={(e) => update('hostName', e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Directory
          <input {...noExtensionInputProps} value={values.directory} onChange={(e) => update('directory', e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Port
          <input {...noExtensionInputProps} value={values.port} onChange={(e) => update('port', e.target.value)} placeholder="10050" className={inputClass} />
        </label>
        <FieldLabel label="PSK ID" hint="Identifies which pre-shared key the Zabbix server should look up when this agent connects - must match an identity the server has been given the corresponding secret for.">
          <input {...noExtensionInputProps} value={values.pskId} onChange={(e) => update('pskId', e.target.value)} className={inputClass} />
        </FieldLabel>
        <FieldLabel
          label={`PSK secret ${zabbix.hasPskSecret ? '(configured - leave blank to keep)' : ''}`}
          hint="Encrypts traffic between this agent and the Zabbix server - must be entered identically on the server side under the matching PSK ID above."
        >
          <input {...noExtensionInputProps} type="password" value={values.pskSecret} onChange={(e) => update('pskSecret', e.target.value)} className={inputClass} />
        </FieldLabel>
        <label className={labelClass}>
          Timeout (s)
          <input {...noExtensionInputProps} value={values.timeout} onChange={(e) => update('timeout', e.target.value)} placeholder="3" className={inputClass} />
        </label>
        <label className={labelClass}>
          Buffer flush interval (s)
          <input {...noExtensionInputProps} value={values.bufferFlushInterval} onChange={(e) => update('bufferFlushInterval', e.target.value)} placeholder="5" className={inputClass} />
        </label>
        <label className={labelClass}>
          Buffer size
          <input {...noExtensionInputProps} value={values.bufferSize} onChange={(e) => update('bufferSize', e.target.value)} placeholder="100" className={inputClass} />
        </label>
        <label className={labelClass}>
          Debug level
          <select value={values.debugLevel} onChange={(e) => update('debugLevel', e.target.value)} className={inputClass}>
            <option value="">Default (warning)</option>
            {ZABBIX_DEBUG_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Log size (MB, 0 = unlimited)
          <input {...noExtensionInputProps} value={values.logSize} onChange={(e) => update('logSize', e.target.value)} placeholder="0" className={inputClass} />
        </label>
        <label className={labelClass}>
          VRF
          <input {...noExtensionInputProps} value={values.vrf} onChange={(e) => update('vrf', e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={values.logRemoteCommands} onChange={(e) => update('logRemoteCommands', e.target.checked)} className="accent-accent-500" />
        Log remote commands
        <InfoTooltip text="Records every command the Zabbix server executes on this agent via remote checks - useful for an audit trail of what monitoring actually ran." />
      </label>
      <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Save settings
      </button>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs text-slate-500">Listen addresses</p>
          <ChipList values={zabbix.listenAddresses} basePath={zabbixAgentPath()} leaf="listen-address" pathLabel="service monitoring zabbix-agent listen-address" placeholder="192.0.2.1" />
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">Servers (passive)</p>
          <ChipList values={zabbix.servers} basePath={zabbixAgentPath()} leaf="server" pathLabel="service monitoring zabbix-agent server" placeholder="192.0.2.1" />
        </div>
      </div>

      <ServerActiveSection zabbix={zabbix} />

      <button onClick={queueDisable} className="mt-3 text-xs text-danger-500 hover:text-danger-400">
        Disable Zabbix Agent
      </button>
    </div>
  )
}

function ServerActiveSection({ zabbix }: { zabbix: MonitoringConfig['zabbixAgent'] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = address.trim()
  const taken = zabbix.serverActive.some((s) => s.address === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addZabbixServerActiveOps(trimmed, port)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setPort('')
    setShowAdd(false)
  }

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-slate-500">Active servers ({zabbix.serverActive.length})</p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 flex items-center gap-2">
          <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.0.2.2" className={inputClass} />
          <input {...noExtensionInputProps} value={port} onChange={(e) => setPort(e.target.value)} placeholder="port (optional)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="text-xs text-danger-500">Already configured.</p>}
        </div>
      )}
      <div className="space-y-1">
        {zabbix.serverActive.map((s) => (
          <div key={s.address} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {s.address}
              {s.port && <span className="text-slate-500">:{s.port}</span>}
            </span>
            <button
              onClick={() => {
                const op = removeZabbixServerActiveOp(s.address)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {zabbix.serverActive.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}

function NetworkEventSection({ config }: { config: MonitoringConfig }) {
  const networkEvent = config.networkEvent
  const add = usePendingChangesStore((s) => s.add)

  if (!networkEvent.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">Network Event monitoring is not configured.</p>
        <button
          onClick={() => {
            const op = enableNetworkEventOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable Network Events
        </button>
      </div>
    )
  }

  return <NetworkEventForm networkEvent={networkEvent} />
}

function NetworkEventForm({ networkEvent }: { networkEvent: MonitoringConfig['networkEvent'] }) {
  const [values, setValues] = useState(() => networkEventConfigToFormValues(networkEvent))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankNetworkEventFormValues>>(
    key: K,
    value: ReturnType<typeof blankNetworkEventFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = networkEventFormToOps(networkEvent, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDisable() {
    const op = disableNetworkEventOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.eventRoute} onChange={(e) => update('eventRoute', e.target.checked)} className="accent-accent-500" />
          Route
          <InfoTooltip text="Logs when entries are added to or removed from the kernel routing table." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.eventLink} onChange={(e) => update('eventLink', e.target.checked)} className="accent-accent-500" />
          Link
          <InfoTooltip text="Logs when a network interface goes up, goes down, or its link state otherwise changes." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.eventAddr} onChange={(e) => update('eventAddr', e.target.checked)} className="accent-accent-500" />
          Address
          <InfoTooltip text="Logs when an IP address is added to or removed from an interface." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.eventNeigh} onChange={(e) => update('eventNeigh', e.target.checked)} className="accent-accent-500" />
          Neighbor
          <InfoTooltip text="Logs ARP/IPv6-neighbor table changes - entries appearing, being updated, or aging out." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.eventRule} onChange={(e) => update('eventRule', e.target.checked)} className="accent-accent-500" />
          Rule
          <InfoTooltip text="Logs changes to kernel policy-routing rules (as opposed to the routes themselves)." />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <FieldLabel label="Queue size" hint="How many pending netlink events can be buffered before older ones are dropped if the logger can't keep up.">
          <input {...noExtensionInputProps} value={values.queueSize} onChange={(e) => update('queueSize', e.target.value)} className={inputClass} />
        </FieldLabel>
        <FieldLabel label="Log level" hint="Minimum severity assigned to these network-change log entries in syslog.">
          <select value={values.logLevel} onChange={(e) => update('logLevel', e.target.value)} className={inputClass}>
            <option value="">Select level…</option>
            {NETWORK_EVENT_LOG_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>
      <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Save settings
      </button>
      <button onClick={queueDisable} className="mt-3 block text-xs text-danger-500 hover:text-danger-400">
        Disable Network Events
      </button>
    </div>
  )
}
