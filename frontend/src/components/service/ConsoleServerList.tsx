import { useState } from 'react'
import {
  blankConsoleServerDeviceFormValues,
  consoleServerDeviceFormToOps,
  consoleServerDeviceToFormValues,
  deleteConsoleServerDeviceOp,
  disableConsoleServerOp,
  enableConsoleServerOp,
  type ConsoleServerDeviceFormValues,
} from '../../lib/serviceConsoleServerForm'
import {
  CONSOLE_PARITIES,
  CONSOLE_SPEEDS,
  type ConsoleServerConfig,
  type ConsoleServerDevice,
} from '../../lib/serviceConsoleServerTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'

export default function ConsoleServerList({ config }: { config: ConsoleServerConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">
          Console server is not configured. Only relevant for routers with serial console
          ports.
        </p>
        <button
          onClick={() => {
            const op = enableConsoleServerOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable console server
        </button>
      </div>
    )
  }

  return <ConsoleServerEnabled config={config} />
}

function ConsoleServerEnabled({ config }: { config: ConsoleServerConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteConsoleServerDeviceOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  function queueDisable() {
    const op = disableConsoleServerOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? config.devices.find((d) => d.name === editingName) : undefined

  return (
    <div className="space-y-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Devices ({config.devices.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New device'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <DeviceForm existingNames={config.devices.map((d) => d.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}
      {editing && (
        <div className="mb-3">
          <DeviceForm
            device={editing}
            existingNames={config.devices.map((d) => d.name)}
            onDone={() => setEditingName(null)}
          />
        </div>
      )}

      <div className="space-y-3">
        {config.devices.map((device) => (
          <div key={device.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-medium text-white">{device.name}</span>
                <p className="text-xs text-slate-400">
                  {device.description || 'no description set'}
                  {device.speed && <span> · {device.speed} baud</span>}
                  {device.sshPort && <span> · SSH port {device.sshPort}</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingName(device.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(device.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {config.devices.length === 0 && <p className="text-xs text-slate-500">No devices configured yet.</p>}
      </div>

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable console server entirely
        </button>
      </div>
    </div>
  )
}

function DeviceForm({
  device,
  existingNames,
  onDone,
}: {
  device?: ConsoleServerDevice
  existingNames: string[]
  onDone: () => void
}) {
  const [name, setName] = useState(device?.name ?? '')
  const [values, setValues] = useState<ConsoleServerDeviceFormValues>(
    device ? consoleServerDeviceToFormValues(device) : blankConsoleServerDeviceFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = device === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof ConsoleServerDeviceFormValues>(key: K, value: ConsoleServerDeviceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = consoleServerDeviceFormToOps(trimmedName, device, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New device' : `Edit ${device.name}`}</h3>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Device *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ttyS0"
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">This device already exists.</span>}
        </label>
        <label className={labelClass}>
          Description
          <input {...noExtensionInputProps} value={values.description} onChange={(e) => update('description', e.target.value)} className={inputClass} />
        </label>
        <FieldLabel label="Alias" hint="A friendly name for this port, shown alongside the device path when connecting - purely cosmetic.">
          <input {...noExtensionInputProps} value={values.alias} onChange={(e) => update('alias', e.target.value)} className={inputClass} />
        </FieldLabel>
        <FieldLabel label="Speed" hint="Baud rate the serial line runs at - must match what the connected device on the other end of the cable expects.">
          <select value={values.speed} onChange={(e) => update('speed', e.target.value)} className={inputClass}>
            <option value="">Select speed…</option>
            {CONSOLE_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Data bits" hint="Number of bits per character on the serial line - almost always 8 unless the connected equipment specifically requires otherwise.">
          <input {...noExtensionInputProps} value={values.dataBits} onChange={(e) => update('dataBits', e.target.value)} placeholder="8" className={inputClass} />
        </FieldLabel>
        <FieldLabel label="Stop bits" hint="Number of bits marking the end of each character frame on the serial line - almost always 1.">
          <input {...noExtensionInputProps} value={values.stopBits} onChange={(e) => update('stopBits', e.target.value)} placeholder="1" className={inputClass} />
        </FieldLabel>
        <FieldLabel label="Parity" hint="Basic error-checking scheme for each character on the serial line - most equipment uses none.">
          <select value={values.parity} onChange={(e) => update('parity', e.target.value)} className={inputClass}>
            <option value="">Default (none)</option>
            {CONSOLE_PARITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="SSH wrapper port" hint="Makes this serial port reachable over the network by exposing it as a local SSH service on this TCP port - connecting there drops straight into the serial session.">
          <input {...noExtensionInputProps} value={values.sshPort} onChange={(e) => update('sshPort', e.target.value)} className={inputClass} />
        </FieldLabel>
      </div>
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
