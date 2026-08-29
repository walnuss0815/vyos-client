import { useState } from 'react'
import OSPFInterfaceForm from './OSPFInterfaceForm'
import { deleteInterfaceOp } from '../../lib/ospfInterfaceForm'
import type { OSPFInterface, OSPFProtocol } from '../../lib/ospfTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'

interface OSPFInterfaceListProps {
  protocol: OSPFProtocol
  interfaces: OSPFInterface[]
  isLoading: boolean
}

/** List of OSPF(v3)-enabled interfaces - mirrors OSPFAreaList.tsx's
 * (and, further back, BGPPeerList.tsx's) list-plus-toggleable-forms
 * structure. */
export default function OSPFInterfaceList({ protocol, interfaces, isLoading }: OSPFInterfaceListProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteInterfaceOp(protocol, name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? interfaces.find((i) => i.name === editingName) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Interfaces ({interfaces.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New interface'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <OSPFInterfaceForm
            protocol={protocol}
            existingNames={interfaces.map((i) => i.name)}
            onDone={() => setShowCreate(false)}
          />
        </div>
      )}

      {editing && (
        <div className="mb-3">
          <OSPFInterfaceForm
            protocol={protocol}
            iface={editing}
            existingNames={interfaces.map((i) => i.name)}
            onDone={() => setEditingName(null)}
          />
        </div>
      )}

      <div className="space-y-2">
        {interfaces.map((iface) => (
          <div
            key={iface.name}
            className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-900 px-3 py-2"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-white">{iface.name}</span>
                {iface.passive && (
                  <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                    passive
                  </span>
                )}
                {iface.authMode && (
                  <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                    auth: {iface.authMode}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {iface.area ? `area ${iface.area}` : 'no area set'}
                {iface.cost && <span> · cost {iface.cost}</span>}
                {iface.networkType && <span> · {iface.networkType}</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setEditingName(iface.name)
                  setShowCreate(false)
                }}
                className="text-xs text-accent-500 hover:text-accent-400"
              >
                Edit
              </button>
              <button
                onClick={() => queueDelete(iface.name)}
                className="text-xs text-slate-500 hover:text-danger-500"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!isLoading && interfaces.length === 0 && (
          <p className="text-xs text-slate-500">No interfaces configured yet.</p>
        )}
      </div>
    </div>
  )
}
