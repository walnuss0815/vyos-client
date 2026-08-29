import { useState } from 'react'
import { addTmpfsOps, removeTmpfsOp } from '../../lib/containerNestedForm'
import type { ContainerDefinition } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** ContainerNestedSections.tsx's "tmpfs mounts" section, extracted
 * into its own file for size (see that file's own doc comment for why
 * it's split this way). */
export default function ContainerTmpfsSection({ container }: { container: ContainerDefinition }) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [destination, setDestination] = useState('')
  const [size, setSize] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = container.tmpfs.some((t) => t.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addTmpfsOps(container.name, trimmedId, destination, size)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setId('')
    setDestination('')
    setSize('')
    setShowAdd(false)
  }

  return (
    <div>
      {container.tmpfs.map((t) => (
        <div key={t.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {t.id}: {t.destination ?? '?'}
            {t.size && <span className="text-slate-500"> ({t.size} MB)</span>}
          </span>
          <button
            onClick={() => {
              const op = removeTmpfsOp(container.name, t.id)
              add({ op, label: `delete ${op.path.join(' ')}` })
            }}
            className="text-xs text-slate-500 hover:text-danger-500"
          >
            Remove
          </button>
        </div>
      ))}
      {container.tmpfs.length === 0 && <p className="text-xs text-slate-500">No tmpfs mounts.</p>}

      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add tmpfs mount'}
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
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="/container/dir"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="size (MB)"
            className={inputClass}
          />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>
            Add tmpfs mount
          </button>
          {taken && <p className="col-span-3 text-danger-500">This tmpfs name is already used.</p>}
        </div>
      )}
    </div>
  )
}
