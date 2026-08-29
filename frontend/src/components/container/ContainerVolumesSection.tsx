import { useState } from 'react'
import { addVolumeOps, removeVolumeOp } from '../../lib/containerNestedForm'
import { CONTAINER_VOLUME_MODES, CONTAINER_VOLUME_PROPAGATIONS, type ContainerDefinition } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

/** ContainerNestedSections.tsx's "Volume mounts" section, extracted
 * into its own file for size (see that file's own doc comment for why
 * it's split this way). */
export default function ContainerVolumesSection({ container }: { container: ContainerDefinition }) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const [mode, setMode] = useState('')
  const [propagation, setPropagation] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = container.volumes.some((v) => v.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addVolumeOps(container.name, trimmedId, source, destination, mode, propagation)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setId('')
    setSource('')
    setDestination('')
    setMode('')
    setPropagation('')
    setShowAdd(false)
  }

  return (
    <div>
      {container.volumes.map((vol) => (
        <div key={vol.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {vol.id}: {vol.source ?? '?'} → {vol.destination ?? '?'}
            {vol.mode && <span className="text-slate-500"> ({vol.mode})</span>}
          </span>
          <button
            onClick={() => {
              const op = removeVolumeOp(container.name, vol.id)
              add({ op, label: `delete ${op.path.join(' ')}` })
            }}
            className="text-xs text-slate-500 hover:text-danger-500"
          >
            Remove
          </button>
        </div>
      ))}
      {container.volumes.length === 0 && <p className="text-xs text-slate-500">No volume mounts.</p>}

      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add volume mount'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            {...noExtensionInputProps}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="name"
            className={inputClass}
          />
          <span className="flex items-center gap-1">
            <input
              {...noExtensionInputProps}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="/config/my-app/data"
              className={`flex-1 ${inputClass}`}
            />
            <InfoTooltip text="Only paths under /config survive a VyOS image upgrade or reinstall - anything outside it is wiped along with the rest of the filesystem. Browse existing directories under /config on the Files page." />
          </span>
          <input
            {...noExtensionInputProps}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="/container/dir"
            className={inputClass}
          />
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
            <option value="">rw (default)</option>
            {CONTAINER_VOLUME_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="col-span-2 flex items-center gap-1">
            <select
              value={propagation}
              onChange={(e) => setPropagation(e.target.value)}
              className={`flex-1 ${inputClass}`}
            >
              <option value="">rprivate (default)</option>
              {CONTAINER_VOLUME_PROPAGATIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <InfoTooltip text="Controls whether new mounts made on the host after this one is created become visible inside the container too - private/rprivate (the safe default) never share; shared/rshared always share; slave/rslave only receive changes one-way from the host." />
          </span>
          <button onClick={submit} disabled={!valid} className={`col-span-2 bg-accent-600 ${buttonClass}`}>
            Add volume mount
          </button>
          {taken && <p className="col-span-4 text-danger-500">This volume name is already used.</p>}
        </div>
      )}
    </div>
  )
}
