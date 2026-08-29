import { useState } from 'react'
import ChipList from '../ChipList'
import NetworkForm from './NetworkForm'
import { deleteContainerNetworkOp } from '../../lib/containerNetworkForm'
import { containerNetworkPath } from '../../lib/containerParse'
import type { ContainerNetwork } from '../../lib/containerTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function NetworkList({ networks, isLoading }: { networks: ContainerNetwork[]; isLoading: boolean }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteContainerNetworkOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? networks.find((n) => n.name === editingName) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Networks ({networks.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New network'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        User-defined Podman networks for containers to attach to (see the Containers tab). Without an
        explicit attachment, VyOS falls back to its own implicit default bridge network.
      </p>

      {showCreate && (
        <div className="mb-3">
          <NetworkForm existingNames={networks.map((n) => n.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}

      {editing && (
        <div className="mb-3">
          <NetworkForm
            network={editing}
            existingNames={networks.map((n) => n.name)}
            onDone={() => setEditingName(null)}
          />
        </div>
      )}

      <div className="space-y-3">
        {networks.map((network) => (
          <div key={network.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-white">{network.name}</span>
                  {network.type && (
                    <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                      {network.type}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{network.description || 'no description set'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingName(network.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(network.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-surface-border pt-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Gateways</p>
                <ChipList
                  values={network.gateways}
                  basePath={containerNetworkPath(network.name)}
                  leaf="gateway"
                  pathLabel={`container network ${network.name} gateway`}
                  placeholder="192.0.2.1"
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Prefixes</p>
                <ChipList
                  values={network.prefixes}
                  basePath={containerNetworkPath(network.name)}
                  leaf="prefix"
                  pathLabel={`container network ${network.name} prefix`}
                  placeholder="192.0.2.0/24"
                />
              </div>
            </div>
          </div>
        ))}
        {!isLoading && networks.length === 0 && <p className="text-xs text-slate-500">No networks configured yet.</p>}
      </div>
    </div>
  )
}
