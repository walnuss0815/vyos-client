import { useState } from 'react'
import RegistryForm from './RegistryForm'
import { deleteContainerRegistryOp } from '../../lib/containerRegistryForm'
import type { ContainerRegistry } from '../../lib/containerTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function RegistryList({
  registries,
  isLoading,
}: {
  registries: ContainerRegistry[]
  isLoading: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteContainerRegistryOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? registries.find((r) => r.name === editingName) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Registries ({registries.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New registry'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Authentication and mirror settings for a container image registry. VyOS uses{' '}
        <code>docker.io</code> and <code>quay.io</code> by default even without an entry here - only
        add one to authenticate against a private registry, use a mirror, or allow insecure access.
      </p>

      {showCreate && (
        <div className="mb-3">
          <RegistryForm existingNames={registries.map((r) => r.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}

      {editing && (
        <div className="mb-3">
          <RegistryForm
            registry={editing}
            existingNames={registries.map((r) => r.name)}
            onDone={() => setEditingName(null)}
          />
        </div>
      )}

      <div className="space-y-3">
        {registries.map((registry) => (
          <div key={registry.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-white">{registry.name}</span>
                  {registry.disabled && (
                    <span className="rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">
                      disabled
                    </span>
                  )}
                  {registry.insecure && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-500">
                      insecure
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {registry.username || 'no username set'}
                  {registry.hasPassword && <span> · password set</span>}
                  {registry.mirror && <span> · mirror configured</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingName(registry.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(registry.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && registries.length === 0 && (
          <p className="text-xs text-slate-500">No registries configured yet.</p>
        )}
      </div>
    </div>
  )
}
