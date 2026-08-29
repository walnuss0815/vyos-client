import { useState } from 'react'
import { deleteEspGroupOp } from '../../lib/vpnIpsecForm'
import type { IPsecConfig } from '../../lib/vpnIpsecTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'
import IpsecEspGroupForm from './IpsecEspGroupForm'
import IpsecEspProposals from './IpsecEspProposals'

/** IpsecCryptoGroups.tsx's "ESP groups" section - one of that
 * component's several sections, extracted into its own file for size
 * (see IpsecCryptoGroups.tsx's own doc comment for why it's split
 * this way). Includes its own create/edit form and per-group proposal
 * list, further extracted into their own files. */
export default function IpsecEspGroupsSection({ config }: { config: IPsecConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteEspGroupOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? config.espGroups.find((g) => g.name === editingName) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          ESP groups ({config.espGroups.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New ESP group'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <IpsecEspGroupForm existingNames={config.espGroups.map((g) => g.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}
      {editing && (
        <div className="mb-3">
          <IpsecEspGroupForm group={editing} existingNames={config.espGroups.map((g) => g.name)} onDone={() => setEditingName(null)} />
        </div>
      )}

      <div className="space-y-3">
        {config.espGroups.map((group) => (
          <div key={group.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-medium text-white">{group.name}</span>
                <p className="text-xs text-slate-400">
                  {group.mode ?? 'tunnel'} · pfs {group.pfs ?? 'enable'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button onClick={() => setExpandedName((n) => (n === group.name ? null : group.name))} className="text-accent-500 hover:text-accent-400">
                  {expandedName === group.name ? 'Hide proposals' : 'Proposals'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(group.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(group.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {expandedName === group.name && <IpsecEspProposals group={group} />}
          </div>
        ))}
        {config.espGroups.length === 0 && <p className="text-xs text-slate-500">No ESP groups configured yet.</p>}
      </div>
    </div>
  )
}
