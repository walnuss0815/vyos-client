import { useState } from 'react'
import ChipList from '../ChipList'
import { broadcastRelayInstancePath } from '../../lib/serviceBroadcastRelayParse'
import {
  blankBroadcastRelayInstanceFormValues,
  broadcastRelayInstanceFormToOps,
  broadcastRelayInstanceToFormValues,
  deleteBroadcastRelayInstanceOp,
  disableBroadcastRelayOp,
  enableBroadcastRelayOp,
  toggleBroadcastRelayServiceDisableOp,
  type BroadcastRelayInstanceFormValues,
} from '../../lib/serviceBroadcastRelayForm'
import type { BroadcastRelayConfig, BroadcastRelayInstance } from '../../lib/serviceBroadcastRelayTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function BroadcastRelayList({ config }: { config: BroadcastRelayConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">Broadcast relay is not configured.</p>
        <button
          onClick={() => {
            const op = enableBroadcastRelayOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable broadcast relay
        </button>
      </div>
    )
  }

  return <BroadcastRelayEnabled config={config} />
}

function BroadcastRelayEnabled({ config }: { config: BroadcastRelayConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(id: string) {
    const op = deleteBroadcastRelayInstanceOp(id)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  function queueDisable() {
    const op = disableBroadcastRelayOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  function toggleServiceDisable() {
    const op = toggleBroadcastRelayServiceDisableOp(!config.disabled)
    add({ op, label: `${op.op} ${op.path.join(' ')}` })
  }

  const editing = editingId ? config.instances.find((i) => i.id === editingId) : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={config.disabled} onChange={toggleServiceDisable} className="accent-accent-500" />
          Disable broadcast relay (all instances)
          <InfoTooltip text="Pauses every relay instance below at once without removing their configuration - a lighter-weight pause than deleting the whole service." />
        </label>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable entirely (remove config)
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Relay instances ({config.instances.length})
          </h2>
          <button
            onClick={() => {
              setShowCreate((v) => !v)
              setEditingId(null)
            }}
            className={`bg-accent-600 ${buttonClass}`}
          >
            {showCreate ? 'Cancel' : '+ New instance'}
          </button>
        </div>

        {showCreate && (
          <div className="mb-3">
            <InstanceForm existingIds={config.instances.map((i) => i.id)} onDone={() => setShowCreate(false)} />
          </div>
        )}
        {editing && (
          <div className="mb-3">
            <InstanceForm
              instance={editing}
              existingIds={config.instances.map((i) => i.id)}
              onDone={() => setEditingId(null)}
            />
          </div>
        )}

        <div className="space-y-3">
          {config.instances.map((instance) => (
            <div key={instance.id} className="rounded-xl border border-surface-border bg-surface-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-medium text-white">id {instance.id}</span>
                  {instance.disabled && (
                    <span className="ml-2 rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">
                      disabled
                    </span>
                  )}
                  <p className="text-xs text-slate-400">{instance.description || 'no description set'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <button
                    onClick={() => {
                      setEditingId(instance.id)
                      setShowCreate(false)
                    }}
                    className="text-accent-500 hover:text-accent-400"
                  >
                    Edit
                  </button>
                  <button onClick={() => queueDelete(instance.id)} className="text-slate-500 hover:text-danger-500">
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <p className="mb-1 text-xs text-slate-500">Interfaces</p>
                <ChipList
                  values={instance.interfaces}
                  basePath={broadcastRelayInstancePath(instance.id)}
                  leaf="interface"
                  pathLabel={`service broadcast-relay id ${instance.id} interface`}
                  placeholder="eth0"
                />
              </div>
            </div>
          ))}
          {config.instances.length === 0 && <p className="text-xs text-slate-500">No relay instances configured yet.</p>}
        </div>
      </div>
    </div>
  )
}

function InstanceForm({
  instance,
  existingIds,
  onDone,
}: {
  instance?: BroadcastRelayInstance
  existingIds: string[]
  onDone: () => void
}) {
  const [id, setId] = useState(instance?.id ?? '')
  const [values, setValues] = useState<BroadcastRelayInstanceFormValues>(
    instance ? broadcastRelayInstanceToFormValues(instance) : blankBroadcastRelayInstanceFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = instance === undefined
  const trimmedId = id.trim()
  const idTaken = isCreate && existingIds.includes(trimmedId)
  const canSubmit = trimmedId !== '' && !idTaken

  function update<K extends keyof BroadcastRelayInstanceFormValues>(key: K, value: BroadcastRelayInstanceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = broadcastRelayInstanceFormToOps(trimmedId, instance, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New instance' : `Edit instance ${instance.id}`}</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          ID (1-99) *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={id}
            onChange={(e) => setId(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          />
          {idTaken && <span className="text-danger-500">This ID is already used.</span>}
        </label>
        <label className={labelClass}>
          Description
          <input {...noExtensionInputProps} value={values.description} onChange={(e) => update('description', e.target.value)} className={inputClass} />
        </label>
        <FieldLabel label="Source address (IPv4)" hint="The relayed broadcast packets appear to originate from this address on the listed interfaces - typically one of their own local addresses.">
          <input {...noExtensionInputProps} value={values.address} onChange={(e) => update('address', e.target.value)} className={inputClass} />
        </FieldLabel>
        <FieldLabel label="Port" hint="Only broadcast (UDP) traffic on this port is relayed between the interfaces - common uses are things like LAN game discovery or Wake-on-LAN across VLANs.">
          <input {...noExtensionInputProps} value={values.port} onChange={(e) => update('port', e.target.value)} className={inputClass} />
        </FieldLabel>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={values.disabled} onChange={(e) => update('disabled', e.target.checked)} className="accent-accent-500" />
        Disable this instance
        <InfoTooltip text="Stops just this one relay instance while leaving other instances and the service itself running." />
      </label>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
