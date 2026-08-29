import { useState } from 'react'
import { deleteMatchGroupOp, matchGroupFormToOps } from '../../lib/qosMatchGroupForm'
import { qosMatchGroupPath } from '../../lib/qosParse'
import type { QosMatchGroup } from '../../lib/qosTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'
import QosMatchList from './QosMatchList'

/** `qos traffic-match-group <name>` list - a reusable, named set of
 * match rules any classful policy's class can reference via
 * `match-group` instead of repeating the same rules in every class
 * (see QosMatchList.tsx's own match-group reference picker). */
export default function QosMatchGroupsList({ groups }: { groups: QosMatchGroup[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = groups.map((g) => g.name)

  function queueDelete(name: string) {
    add({ op: deleteMatchGroupOp(name), label: `delete qos traffic-match-group ${name}` })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Match groups
          <InfoTooltip text="A named, reusable set of match rules - reference it by name from any classful policy's class instead of repeating the same rules everywhere." />
        </p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditing(null)
            setNewName('')
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add group'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-surface-border bg-surface-900 p-4">
          <label className={`${labelClass} mb-2`}>
            Name
            <input
              {...noExtensionInputProps}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="WEB"
              className={`font-mono ${inputClass}`}
            />
          </label>
          {newName.trim() !== '' && !existingNames.includes(newName.trim()) && (
            <button
              onClick={() => {
                const trimmed = newName.trim()
                const ops = matchGroupFormToOps(trimmed, undefined, { description: '' })
                for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}` })
                setShowAdd(false)
                setEditing(trimmed)
              }}
              className={`bg-accent-600 ${buttonClass}`}
            >
              Add group
            </button>
          )}
        </div>
      )}

      {groups.length === 0 && !showAdd && <p className="text-xs text-slate-500">No match groups configured yet.</p>}

      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-white">{group.name}</span>
              <div>
                <button
                  onClick={() => setEditing(editing === group.name ? null : group.name)}
                  className="text-xs text-accent-500 hover:text-accent-400"
                >
                  {editing === group.name ? 'Close' : 'Manage'}
                </button>{' '}
                <button onClick={() => queueDelete(group.name)} className="ml-2 text-xs text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {group.description && <p className="text-xs text-slate-400">{group.description}</p>}
            <p className="mt-1 text-xs text-slate-500">{group.matches.length} match rule(s)</p>

            {editing === group.name && (
              <div className="mt-3 border-t border-surface-border pt-3">
                <QosMatchList
                  basePath={qosMatchGroupPath(group.name)}
                  matches={group.matches}
                  matchGroups={[]}
                  availableMatchGroups={groups.map((g) => g.name).filter((n) => n !== group.name)}
                  pathLabel={`qos traffic-match-group ${group.name}`}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
