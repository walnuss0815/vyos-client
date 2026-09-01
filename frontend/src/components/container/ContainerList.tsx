import { useState } from 'react'
import ContainerForm from './ContainerForm'
import ContainerImageUpdateCheck from './ContainerImageUpdateCheck'
import ContainerNestedSections from './ContainerNestedSections'
import { deleteContainerOp } from '../../lib/containerForm'
import type { ContainerDefinition, ContainerNetwork } from '../../lib/containerTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function ContainerList({
  containers,
  networks,
  isLoading,
}: {
  containers: ContainerDefinition[]
  networks: ContainerNetwork[]
  isLoading: boolean
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteContainerOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? containers.find((c) => c.name === editingName) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Containers ({containers.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New container'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        A container definition references an image by name/tag - if it hasn't been pulled onto
        the router yet, the form below will show a "Pull now" prompt, or pull one ahead of time
        from the Images tab.
      </p>

      {showCreate && (
        <div className="mb-3">
          <ContainerForm
            existingNames={containers.map((c) => c.name)}
            networks={networks}
            onDone={() => setShowCreate(false)}
          />
        </div>
      )}

      {editing && (
        <div className="mb-3">
          <ContainerForm
            container={editing}
            existingNames={containers.map((c) => c.name)}
            networks={networks}
            onDone={() => setEditingName(null)}
          />
        </div>
      )}

      <div className="space-y-3">
        {containers.map((container) => (
          <div key={container.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-white">{container.name}</span>
                  {container.disabled && (
                    <span className="rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">
                      disabled
                    </span>
                  )}
                  {container.privileged && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-500">
                      privileged
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{container.image || 'no image set'}</p>
                {container.image && <ContainerImageUpdateCheck image={container.image} containerName={container.name} />}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => setExpandedName((n) => (n === container.name ? null : container.name))}
                  className="text-accent-500 hover:text-accent-400"
                >
                  {expandedName === container.name ? 'Hide details' : 'Details'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(container.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(container.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>

            {expandedName === container.name && (
              <ContainerNestedSections container={container} networks={networks} />
            )}
          </div>
        ))}
        {!isLoading && containers.length === 0 && (
          <p className="text-xs text-slate-500">No containers configured yet.</p>
        )}
      </div>
    </div>
  )
}
