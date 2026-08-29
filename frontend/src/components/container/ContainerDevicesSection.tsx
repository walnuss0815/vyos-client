import { useState } from 'react'
import { addDeviceOps, removeDeviceOp } from '../../lib/containerNestedForm'
import type { ContainerDefinition } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** ContainerNestedSections.tsx's "Devices" section, extracted into
 * its own file for size (see that file's own doc comment for why it's
 * split this way). */
export default function ContainerDevicesSection({ container }: { container: ContainerDefinition }) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = container.devices.some((d) => d.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addDeviceOps(container.name, trimmedId, source, destination)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setId('')
    setSource('')
    setDestination('')
    setShowAdd(false)
  }

  return (
    <div>
      {container.devices.map((d) => (
        <div key={d.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {d.id}: {d.source ?? '?'} → {d.destination ?? '?'}
          </span>
          <button
            onClick={() => {
              const op = removeDeviceOp(container.name, d.id)
              add({ op, label: `delete ${op.path.join(' ')}` })
            }}
            className="text-xs text-slate-500 hover:text-danger-500"
          >
            Remove
          </button>
        </div>
      ))}
      {container.devices.length === 0 && <p className="text-xs text-slate-500">No devices passed through.</p>}

      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add device'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input
            {...noExtensionInputProps}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="name"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="/dev/x (host)"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="/dev/x (container)"
            className={inputClass}
          />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>
            Add device
          </button>
          {taken && <p className="col-span-3 text-danger-500">This device name is already used.</p>}
        </div>
      )}
    </div>
  )
}
