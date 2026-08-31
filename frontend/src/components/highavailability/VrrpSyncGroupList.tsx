import { useState } from 'react'
import {
  addVRRPSyncGroupMemberOp,
  blankVRRPSyncGroupFormValues,
  deleteVRRPSyncGroupOp,
  removeVRRPSyncGroupMemberOp,
  vrrpSyncGroupFormToOps,
  vrrpSyncGroupToFormValues,
  type VRRPSyncGroupFormValues,
} from '../../lib/haVrrpForm'
import type { VRRPGroup, VRRPSyncGroup } from '../../lib/haTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

/** `vrrp sync-group <name>` list - ties several VRRP groups' state
 * transitions together (all members transition as one unit). Members
 * are picked via checkboxes fed by the sibling `groups` list from the
 * same useHAConfig() fetch - the same "live dropdown for a sibling
 * tagNode name" pattern HAProxy's service->backend picker introduced. */
export default function VrrpSyncGroupList({ syncGroups, groups }: { syncGroups: VRRPSyncGroup[]; groups: VRRPGroup[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = syncGroups.map((g) => g.name)

  function queueDelete(name: string) {
    add({ op: deleteVRRPSyncGroupOp(name), label: `delete high-availability vrrp sync-group ${name}` })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Sync groups
          <InfoTooltip text="Ties several VRRP groups together so they always transition state as one unit - e.g. so a firewall's inside and outside interfaces fail over together, not independently." />
        </p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditing(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add sync group'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-surface-border bg-surface-900 p-4">
          {/* Name lives inside VrrpSyncGroupFormPanel itself (not
           * gating this panel's existence on it) so clearing it
           * mid-fill doesn't unmount the panel and discard every
           * other field already filled in - see HaproxyServiceList's
           * equivalent comment for the full rationale. */}
          <VrrpSyncGroupFormPanel existingNames={existingNames} groups={groups} onDone={() => setShowAdd(false)} />
        </div>
      )}

      {syncGroups.length === 0 && !showAdd && <p className="text-xs text-slate-500">No sync groups configured yet.</p>}

      <div className="space-y-3">
        {syncGroups.map((syncGroup) => (
          <div key={syncGroup.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            {editing === syncGroup.name ? (
              <VrrpSyncGroupFormPanel
                existingNames={existingNames}
                syncGroup={syncGroup}
                groups={groups}
                onDone={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-white">{syncGroup.name}</span>
                  <div>
                    <button
                      onClick={() => {
                        setEditing(syncGroup.name)
                        setShowAdd(false)
                      }}
                      className="text-xs text-accent-500 hover:text-accent-400"
                    >
                      Edit
                    </button>{' '}
                    <button
                      onClick={() => queueDelete(syncGroup.name)}
                      className="ml-2 text-xs text-slate-500 hover:text-danger-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  members: {syncGroup.members.join(', ') || '(none)'}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function VrrpSyncGroupFormPanel({
  syncGroup,
  groups,
  existingNames,
  onDone,
}: {
  syncGroup?: VRRPSyncGroup
  groups: VRRPGroup[]
  existingNames: string[]
  onDone: () => void
}) {
  const add = usePendingChangesStore((s) => s.add)
  const isCreate = syncGroup === undefined
  const [newName, setNewName] = useState('')
  const [values, setValues] = useState<VRRPSyncGroupFormValues>(
    syncGroup ? vrrpSyncGroupToFormValues(syncGroup) : blankVRRPSyncGroupFormValues(),
  )
  const [selectedMembers, setSelectedMembers] = useState<string[]>(syncGroup?.members ?? [])

  const name = isCreate ? newName.trim() : syncGroup.name
  const nameTaken = isCreate && existingNames.includes(name)
  const nameValid = !isCreate || (name !== '' && !nameTaken)

  function update<K extends keyof VRRPSyncGroupFormValues>(key: K, value: VRRPSyncGroupFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function toggleMember(groupName: string) {
    setSelectedMembers((cur) => (cur.includes(groupName) ? cur.filter((m) => m !== groupName) : [...cur, groupName]))
  }

  function submit() {
    if (!nameValid) return
    const ops = vrrpSyncGroupFormToOps(name, syncGroup, values)
    const before = new Set(syncGroup?.members ?? [])
    const after = new Set(selectedMembers)
    for (const m of after) if (!before.has(m)) ops.push(addVRRPSyncGroupMemberOp(name, m))
    for (const m of before) if (!after.has(m)) ops.push(removeVRRPSyncGroupMemberOp(name, m))
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    onDone()
  }

  return (
    <div>
      {isCreate && (
        <label className={`${labelClass} mb-3`}>
          Name
          <input
            {...noExtensionInputProps}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="INTERNAL"
            className={`font-mono ${inputClass}`}
          />
          {nameTaken && <span className="text-danger-500">A sync group named "{name}" already exists.</span>}
        </label>
      )}
      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Member groups</p>
        <div className="flex flex-wrap gap-3">
          {groups.length === 0 && <p className="text-xs text-slate-500">No VRRP groups defined yet.</p>}
          {groups.map((g) => (
            <label key={g.name} className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={selectedMembers.includes(g.name)}
                onChange={() => toggleMember(g.name)}
                className="accent-accent-500"
              />
              {g.name}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Health check (optional)
          <InfoTooltip text="A group that joins a sync-group must not also have its own health check - VyOS uses only the sync-group's." />
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            {...noExtensionInputProps}
            value={values.healthCheckPing}
            onChange={(e) => update('healthCheckPing', e.target.value)}
            placeholder="ping target"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.healthCheckScript}
            onChange={(e) => update('healthCheckScript', e.target.value)}
            placeholder="or script path"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={values.healthCheckFailureCount}
            onChange={(e) => update('healthCheckFailureCount', e.target.value)}
            placeholder="failure count (3)"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.healthCheckInterval}
            onChange={(e) => update('healthCheckInterval', e.target.value)}
            placeholder="interval sec (60)"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Transition scripts (optional)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            {...noExtensionInputProps}
            value={values.transitionMaster}
            onChange={(e) => update('transitionMaster', e.target.value)}
            placeholder="master"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={values.transitionBackup}
            onChange={(e) => update('transitionBackup', e.target.value)}
            placeholder="backup"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={values.transitionFault}
            onChange={(e) => update('transitionFault', e.target.value)}
            placeholder="fault"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={values.transitionStop}
            onChange={(e) => update('transitionStop', e.target.value)}
            placeholder="stop"
            className={`font-mono ${inputClass}`}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={!nameValid} className={`bg-accent-600 ${buttonClass}`}>
          {syncGroup ? 'Save' : 'Add sync group'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  )
}
