import { useState } from 'react'
import { deleteMatchGroupOp, matchGroupFormToOps } from '../../lib/qosMatchGroupForm'
import { addQosMatchOps, blankQosMatchOptions } from '../../lib/qosMatchForm'
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
  const [firstMatchId, setFirstMatchId] = useState('')
  const [firstMatchDestAddress, setFirstMatchDestAddress] = useState('')
  const [firstMatchDestPort, setFirstMatchDestPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = groups.map((g) => g.name)

  function queueDelete(name: string) {
    add({ op: deleteMatchGroupOp(name), label: `delete qos traffic-match-group ${name}` })
  }

  function addGroup() {
    const trimmed = newName.trim()
    const ops = matchGroupFormToOps(trimmed, undefined, { description: '' })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}` })
    // A group's match rules used to only be configurable AFTER the
    // group already existed - QosMatchList only ever operates on an
    // already-fetched group. Queuing a first one here, in the same
    // commit as the group itself, avoids a detour through
    // commit+refetch.
    const trimmedMatchId = firstMatchId.trim()
    if (trimmedMatchId) {
      const matchOps = addQosMatchOps(qosMatchGroupPath(trimmed), trimmedMatchId, {
        ...blankQosMatchOptions(),
        ipDestinationAddress: firstMatchDestAddress.trim(),
        ipDestinationPort: firstMatchDestPort.trim(),
      })
      for (const op of matchOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setShowAdd(false)
    setEditing(trimmed)
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
            <>
              <div className="mb-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">First match rule (optional)</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    {...noExtensionInputProps}
                    value={firstMatchId}
                    onChange={(e) => setFirstMatchId(e.target.value)}
                    placeholder="match name"
                    className={`font-mono ${inputClass}`}
                  />
                  <input
                    {...noExtensionInputProps}
                    value={firstMatchDestAddress}
                    onChange={(e) => setFirstMatchDestAddress(e.target.value)}
                    placeholder="destination address"
                    className={inputClass}
                  />
                  <input
                    {...noExtensionInputProps}
                    value={firstMatchDestPort}
                    onChange={(e) => setFirstMatchDestPort(e.target.value)}
                    placeholder="destination port"
                    className={inputClass}
                  />
                </div>
              </div>
              <button onClick={addGroup} className={`bg-accent-600 ${buttonClass}`}>
                Add group
              </button>
            </>
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
