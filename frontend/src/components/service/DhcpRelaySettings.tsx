import { useState } from 'react'
import ChipList from '../ChipList'
import { dhcpRelayPath, dhcpv6RelayUpstreamInterfacePath } from '../../lib/serviceDhcpRelayParse'
import {
  addDHCPv6RelayListenInterfaceOps,
  addDHCPv6RelayUpstreamInterfaceOp,
  blankDHCPRelaySettingsFormValues,
  blankDHCPv6RelaySettingsFormValues,
  dhcpRelayConfigToFormValues,
  dhcpRelaySettingsFormToOps,
  dhcpv6RelayConfigToFormValues,
  dhcpv6RelaySettingsFormToOps,
  removeDHCPv6RelayListenInterfaceOp,
  removeDHCPv6RelayUpstreamInterfaceOp,
} from '../../lib/serviceDhcpRelayForm'
import { DHCP_RELAY_AGENTS_PACKETS_MODES, type DHCPRelayConfig, type DHCPv6RelayConfig } from '../../lib/serviceDhcpRelayTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function DhcpRelaySettings({
  v4,
  v6,
}: {
  v4: DHCPRelayConfig
  v6: DHCPv6RelayConfig
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">DHCP relay (IPv4)</h2>
        <V4Settings config={v4} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">DHCPv6 relay</h2>
        <V6Settings config={v6} />
      </div>
    </div>
  )
}

function V4Settings({ config }: { config: DHCPRelayConfig }) {
  const [values, setValues] = useState(() => dhcpRelayConfigToFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankDHCPRelaySettingsFormValues>>(
    key: K,
    value: ReturnType<typeof blankDHCPRelaySettingsFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = dhcpRelaySettingsFormToOps(config, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-3 gap-3">
        <FieldLabel label="Hop count" hint="Maximum number of relay hops a DHCP request may pass through before being dropped - guards against forwarding loops.">
          <input
            {...noExtensionInputProps}
            value={values.hopCount}
            onChange={(e) => update('hopCount', e.target.value)}
            placeholder="10"
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Max packet size" hint="Largest DHCP packet this relay will forward, in bytes - packets bigger than this are dropped rather than fragmented.">
          <input
            {...noExtensionInputProps}
            value={values.maxSize}
            onChange={(e) => update('maxSize', e.target.value)}
            placeholder="576"
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel
          label="Relay agent packets"
          hint="How to handle inbound packets that already carry relay-agent option 82 data - forward passes it through, discard/replace strip or overwrite it, useful when this relay sits behind another one."
        >
          <select
            value={values.relayAgentsPackets}
            onChange={(e) => update('relayAgentsPackets', e.target.value)}
            className={inputClass}
          >
            <option value="">Default (forward)</option>
            {DHCP_RELAY_AGENTS_PACKETS_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={values.disabled}
          onChange={(e) => update('disabled', e.target.checked)}
          className="accent-accent-500"
        />
        Disable DHCP relay
        <InfoTooltip text="Keeps the interfaces and servers below configured without actually relaying any DHCP traffic." />
      </label>
      <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Save settings
      </button>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Interfaces</p>
          <ChipList
            values={config.interfaces}
            basePath={dhcpRelayPath()}
            leaf="interface"
            pathLabel="service dhcp-relay interface"
            placeholder="eth0"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Listen interfaces</p>
          <ChipList
            values={config.listenInterfaces}
            basePath={dhcpRelayPath()}
            leaf="listen-interface"
            pathLabel="service dhcp-relay listen-interface"
            placeholder="eth0"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Upstream interfaces</p>
          <ChipList
            values={config.upstreamInterfaces}
            basePath={dhcpRelayPath()}
            leaf="upstream-interface"
            pathLabel="service dhcp-relay upstream-interface"
            placeholder="eth1"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Relay servers</p>
          <ChipList
            values={config.servers}
            basePath={dhcpRelayPath()}
            leaf="server"
            pathLabel="service dhcp-relay server"
            placeholder="192.0.2.1"
          />
        </div>
      </div>
    </div>
  )
}

function V6Settings({ config }: { config: DHCPv6RelayConfig }) {
  const [values, setValues] = useState(() => dhcpv6RelayConfigToFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankDHCPv6RelaySettingsFormValues>>(
    key: K,
    value: ReturnType<typeof blankDHCPv6RelaySettingsFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = dhcpv6RelaySettingsFormToOps(config, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Max hop count" hint="Maximum number of relay hops a DHCPv6 request may pass through before being dropped - guards against forwarding loops.">
          <input
            {...noExtensionInputProps}
            value={values.maxHopCount}
            onChange={(e) => update('maxHopCount', e.target.value)}
            placeholder="10"
            className={inputClass}
          />
        </FieldLabel>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.disabled}
            onChange={(e) => update('disabled', e.target.checked)}
            className="accent-accent-500"
          />
          Disable DHCPv6 relay
          <InfoTooltip text="Keeps the interfaces below configured without actually relaying any DHCPv6 traffic." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.useInterfaceIdOption}
            onChange={(e) => update('useInterfaceIdOption', e.target.checked)}
            className="accent-accent-500"
          />
          Set DHCPv6 interface-ID option
          <InfoTooltip text="Tags each relayed request with which listening interface it arrived on, so the DHCPv6 server can hand out addresses appropriate to that specific link." />
        </label>
      </div>
      <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Save settings
      </button>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <ListenInterfaces config={config} />
        <UpstreamInterfaces config={config} />
      </div>
    </div>
  )
}

function ListenInterfaces({ config }: { config: DHCPv6RelayConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [interfaceName, setInterfaceName] = useState('')
  const [address, setAddress] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = interfaceName.trim()
  const taken = config.listenInterfaces.some((i) => i.interfaceName === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addDHCPv6RelayListenInterfaceOps(trimmed, address)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setInterfaceName('')
    setAddress('')
    setShowAdd(false)
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Listen interfaces</p>
      {config.listenInterfaces.map((li) => (
        <div key={li.interfaceName} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {li.interfaceName}
            {li.address && <span className="text-slate-500"> ({li.address})</span>}
          </span>
          <button
            onClick={() => {
              const op = removeDHCPv6RelayListenInterfaceOp(li.interfaceName)
              add({ op, label: `delete ${op.path.join(' ')}` })
            }}
            className="text-xs text-slate-500 hover:text-danger-500"
          >
            Remove
          </button>
        </div>
      ))}
      {config.listenInterfaces.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add'}
      </button>
      {showAdd && (
        <div className="mt-2 space-y-2">
          <input
            {...noExtensionInputProps}
            value={interfaceName}
            onChange={(e) => setInterfaceName(e.target.value)}
            placeholder="eth0"
            className={`w-full ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="listen address (optional)"
            className={`w-full ${inputClass}`}
          />
          <button onClick={submit} disabled={!valid} className={`w-full bg-accent-600 ${buttonClass}`}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}

function UpstreamInterfaces({ config }: { config: DHCPv6RelayConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [interfaceName, setInterfaceName] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = interfaceName.trim()
  const taken = config.upstreamInterfaces.some((i) => i.interfaceName === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const op = addDHCPv6RelayUpstreamInterfaceOp(trimmed)
    add({ op, label: `set ${op.path.join(' ')}` })
    setInterfaceName('')
    setShowAdd(false)
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Upstream interfaces</p>
      {config.upstreamInterfaces.map((ui) => (
        <div key={ui.interfaceName} className="mb-2 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">{ui.interfaceName}</span>
            <button
              onClick={() => {
                const op = removeDHCPv6RelayUpstreamInterfaceOp(ui.interfaceName)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
          <ChipList
            values={ui.addresses}
            basePath={dhcpv6RelayUpstreamInterfacePath(ui.interfaceName)}
            leaf="address"
            pathLabel={`service dhcpv6-relay upstream-interface ${ui.interfaceName} address`}
            placeholder="2001:db8::1"
          />
        </div>
      ))}
      {config.upstreamInterfaces.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add'}
      </button>
      {showAdd && (
        <div className="mt-2 space-y-2">
          <input
            {...noExtensionInputProps}
            value={interfaceName}
            onChange={(e) => setInterfaceName(e.target.value)}
            placeholder="eth1"
            className={`w-full ${inputClass}`}
          />
          <button onClick={submit} disabled={!valid} className={`w-full bg-accent-600 ${buttonClass}`}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}
