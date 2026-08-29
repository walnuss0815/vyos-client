import { useState } from 'react'
import {
  addConntrackSyncInterfaceOps,
  conntrackSyncFormToOps,
  conntrackSyncToFormValues,
  removeConntrackSyncInterfaceOp,
  type ConntrackSyncFormValues,
} from '../../lib/haConntrackSyncForm'
import { conntrackSyncPath } from '../../lib/haParse'
import { CONNTRACK_SYNC_ACCEPT_PROTOCOLS, CONNTRACK_SYNC_EXPECT_SYNC_PROTOCOLS } from '../../lib/haTypes'
import type { ConntrackSyncConfig, VRRPSyncGroup } from '../../lib/haTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ChipList from '../ChipList'
import FieldLabel from '../FieldLabel'

/** `service conntrack-sync` settings - mostly a singleton block (one
 * "Save" form for its scalar/flag fields, plus ChipList-backed
 * multi-valued leaves), with one nested list: the sync `interface
 * <name>` peers. The VRRP sync-group picker is a real dropdown fed by
 * the sibling `high-availability vrrp sync-group` list from the same
 * useHAConfig() fetch - VyOS's own conf-mode script requires this
 * reference to point at a group that actually exists. */
export default function ConntrackSyncSettings({
  config,
  vrrpSyncGroups,
}: {
  config: ConntrackSyncConfig
  vrrpSyncGroups: VRRPSyncGroup[]
}) {
  const add = usePendingChangesStore((s) => s.add)
  const before = conntrackSyncToFormValues(config)
  const [values, setValues] = useState<ConntrackSyncFormValues>(before)

  function update<K extends keyof ConntrackSyncFormValues>(key: K, value: ConntrackSyncFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = conntrackSyncFormToOps(before, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <div className="mb-6 rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Settings</p>

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FieldLabel
            label="VRRP sync group"
            hint="Required for conntrack-sync to actually fail over - must reference an existing sync group on the VRRP tab."
          >
            <select value={values.vrrpSyncGroup} onChange={(e) => update('vrrpSyncGroup', e.target.value)} className={inputClass}>
              <option value="">(none)</option>
              {vrrpSyncGroups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </FieldLabel>
          <label className={labelClass}>
            Multicast group
            <input
              {...noExtensionInputProps}
              value={values.mcastGroup}
              onChange={(e) => update('mcastGroup', e.target.value)}
              className={`font-mono ${inputClass}`}
            />
          </label>
          <label className={labelClass}>
            Purge timeout (seconds)
            <input
              {...noExtensionInputProps}
              value={values.purgeTimeout}
              onChange={(e) => update('purgeTimeout', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Event listen queue size (MB)
            <input
              {...noExtensionInputProps}
              value={values.eventListenQueueSize}
              onChange={(e) => update('eventListenQueueSize', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Sync queue size (MB)
            <input
              {...noExtensionInputProps}
              value={values.syncQueueSize}
              onChange={(e) => update('syncQueueSize', e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="mb-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.disableExternalCache}
              onChange={(e) => update('disableExternalCache', e.target.checked)}
              className="accent-accent-500"
            />
            Disable external cache
            <InfoTooltipInline text="Injects flow states directly into the backup firewall's kernel conntrack table instead of holding them in a userspace cache." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.disableSyslog}
              onChange={(e) => update('disableSyslog', e.target.checked)}
              className="accent-accent-500"
            />
            Disable syslog
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.startupResync}
              onChange={(e) => update('startupResync', e.target.checked)}
              className="accent-accent-500"
            />
            Full resync at startup
          </label>
        </div>

        <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
          Save settings
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldLabel label="Accepted protocols" hint="Which protocols' local conntrack entries get synced at all.">
          <ChipList
            values={config.acceptProtocols}
            basePath={conntrackSyncPath()}
            leaf="accept-protocol"
            pathLabel="... accept-protocol"
            placeholder={CONNTRACK_SYNC_ACCEPT_PROTOCOLS.join('/')}
          />
        </FieldLabel>
        <FieldLabel label="Expectation sync protocols" hint="Protocols needing expect-table sync (e.g. ftp's passive-mode data channel).">
          <ChipList
            values={config.expectSync}
            basePath={conntrackSyncPath()}
            leaf="expect-sync"
            pathLabel="... expect-sync"
            placeholder={CONNTRACK_SYNC_EXPECT_SYNC_PROTOCOLS.join('/')}
          />
        </FieldLabel>
        <ChipList
          values={config.ignoreAddresses}
          basePath={conntrackSyncPath()}
          leaf="ignore-address"
          pathLabel="... ignore-address"
          placeholder="address/prefix to never sync"
        />
        <ChipList
          values={config.listenAddresses}
          basePath={conntrackSyncPath()}
          leaf="listen-address"
          pathLabel="... listen-address"
          placeholder="local address to listen on"
        />
      </div>

      <ConntrackSyncInterfacesSection config={config} />
    </div>
  )
}

// A tiny inline tooltip wrapper avoids importing InfoTooltip just for
// two call sites here that aren't inside a FieldLabel-wrapped select.
function InfoTooltipInline({ text }: { text: string }) {
  return (
    <span className="text-slate-600" title={text}>
      (?)
    </span>
  )
}

function ConntrackSyncInterfacesSection({ config }: { config: ConntrackSyncConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [peer, setPeer] = useState('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = config.interfaces.some((i) => i.name === trimmedName)
  const valid = trimmedName !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addConntrackSyncInterfaceOps(trimmedName, peer, port)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setName('')
    setPeer('')
    setPort('')
    setShowAdd(false)
  }

  function queueRemove(ifaceName: string) {
    const op = removeConntrackSyncInterfaceOp(ifaceName)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Sync interfaces</p>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add interface'}
        </button>
      </div>

      {config.interfaces.map((iface) => (
        <div key={iface.name} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {iface.name}
            {iface.peer && ` -> peer ${iface.peer}`}
            {iface.port !== undefined && `:${iface.port}`}
          </span>
          <button onClick={() => queueRemove(iface.name)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {config.interfaces.length === 0 && !showAdd && (
        <p className="text-xs text-slate-500">No sync interfaces configured yet.</p>
      )}

      {showAdd && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input
            {...noExtensionInputProps}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="eth1"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={peer}
            onChange={(e) => setPeer(e.target.value)}
            placeholder="unicast peer (optional)"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="port (optional)"
            className={inputClass}
          />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>
            Add interface
          </button>
          {taken && <p className="col-span-3 text-xs text-danger-500">This interface is already listed.</p>}
        </div>
      )}
    </div>
  )
}
