import { useState } from 'react'
import { addDeviceOps, removeDeviceOp } from '../../lib/containerNestedForm'
import type { ContainerDevice } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** ContainerNestedSections.tsx's "Devices" section, extracted into
 * its own file for size (see that file's own doc comment for why it's
 * split this way). Also reused by ContainerCreateNestedSections.tsx
 * in draft mode (via onAdd/onRemove) - see this component's own prop
 * doc comments. */
export default function ContainerDevicesSection({
  containerName,
  devices,
  onAdd,
  onRemove,
}: {
  containerName: string
  devices: ContainerDevice[]
  /** Overrides what "Add device" does, in place of the default
   * "immediately queue the real set ops" - see ChipList.tsx's onAdd
   * doc comment for the general rationale. `devices` must then be
   * whatever local state onAdd/onRemove write to. */
  onAdd?: (id: string, source: string, destination: string) => void
  /** The mirror of onAdd, for Remove. */
  onRemove?: (id: string) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = devices.some((d) => d.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    if (onAdd) {
      onAdd(trimmedId, source, destination)
    } else {
      const ops = addDeviceOps(containerName, trimmedId, source, destination)
      for (const op of ops) {
        add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
      }
    }
    setId('')
    setSource('')
    setDestination('')
    setShowAdd(false)
  }

  function remove(devId: string) {
    if (onRemove) {
      onRemove(devId)
      return
    }
    const op = removeDeviceOp(containerName, devId)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      {devices.map((d) => (
        <div key={d.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {d.id}: {d.source ?? '?'} → {d.destination ?? '?'}
          </span>
          <button onClick={() => remove(d.id)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {devices.length === 0 && <p className="text-xs text-slate-500">No devices passed through.</p>}

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
