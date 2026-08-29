import { useState } from 'react'
import {
  blankShaperClassFormValues,
  blankShaperPolicyFormValues,
  deleteShaperClassOp,
  deleteShaperPolicyOp,
  shaperClassFormToOps,
  shaperClassPath,
  shaperClassToFormValues,
  shaperDefaultClassFormToOps,
  shaperDefaultClassToFormValues,
  shaperPolicyFormToOps,
  shaperPolicyToFormValues,
  type ShaperClassFormValues,
} from '../../lib/qosShaperForm'
import type { QosShaperClass, QosShaperPolicy } from '../../lib/qosTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import QosMatchList from './QosMatchList'

/** `qos policy shaper <name>` list - HTB-based class-based bandwidth
 * shaping, this app's "if in doubt, use this" recommended policy type
 * per VyOS's own docs (egress only). */
export default function ShaperPolicyList({
  policies,
  availableMatchGroups,
}: {
  policies: QosShaperPolicy[]
  availableMatchGroups: string[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = policies.map((p) => p.name)

  function queueDelete(name: string) {
    add({ op: deleteShaperPolicyOp(name), label: `delete qos policy shaper ${name}` })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Shaper (HTB)</p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditing(null)
            setNewName('')
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add policy'}
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
              placeholder="WAN-OUT"
              className={`font-mono ${inputClass}`}
            />
          </label>
          {newName.trim() !== '' && !existingNames.includes(newName.trim()) && (
            <button
              onClick={() => {
                const trimmed = newName.trim()
                const ops = shaperPolicyFormToOps(trimmed, undefined, blankShaperPolicyFormValues())
                for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
                setShowAdd(false)
                setEditing(trimmed)
              }}
              className={`bg-accent-600 ${buttonClass}`}
            >
              Add policy
            </button>
          )}
        </div>
      )}

      {policies.length === 0 && !showAdd && <p className="text-xs text-slate-500">No shaper policies configured yet.</p>}

      <div className="space-y-3">
        {policies.map((policy) => (
          <div key={policy.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-white">
                {policy.name} <span className="text-xs text-slate-500">({policy.bandwidth})</span>
              </span>
              <div>
                <button
                  onClick={() => setEditing(editing === policy.name ? null : policy.name)}
                  className="text-xs text-accent-500 hover:text-accent-400"
                >
                  {editing === policy.name ? 'Close' : 'Manage'}
                </button>{' '}
                <button onClick={() => queueDelete(policy.name)} className="ml-2 text-xs text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {policy.classes.length} class{policy.classes.length === 1 ? '' : 'es'}
            </p>

            {editing === policy.name && (
              <div className="mt-3 space-y-3 border-t border-surface-border pt-3">
                <ShaperPolicyFields policy={policy} />
                <ShaperClassList policy={policy} availableMatchGroups={availableMatchGroups} />
                <ShaperDefaultClassPanel policy={policy} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ShaperPolicyFields({ policy }: { policy: QosShaperPolicy }) {
  const add = usePendingChangesStore((s) => s.add)
  const before = shaperPolicyToFormValues(policy)
  const [values, setValues] = useState(before)

  function submit() {
    const ops = shaperPolicyFormToOps(policy.name, policy, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label className={labelClass}>
        Description
        <input
          {...noExtensionInputProps}
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Bandwidth
        <input
          {...noExtensionInputProps}
          value={values.bandwidth}
          onChange={(e) => setValues((v) => ({ ...v, bandwidth: e.target.value }))}
          placeholder="auto, a %, or e.g. 100mbit"
          className={inputClass}
        />
      </label>
      <div className="flex items-end">
        <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
          Save policy
        </button>
      </div>
    </div>
  )
}

function ShaperClassList({ policy, availableMatchGroups }: { policy: QosShaperPolicy; availableMatchGroups: string[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingClass, setEditingClass] = useState<string | null>(null)
  const [newId, setNewId] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const existingIds = policy.classes.map((c) => c.id)

  function queueDelete(classId: string) {
    add({ op: deleteShaperClassOp(policy.name, classId), label: `delete qos policy shaper ${policy.name} class ${classId}` })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500">Classes</p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add class'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 flex items-center gap-2">
          <input
            {...noExtensionInputProps}
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="class ID (2-4095)"
            className={inputClass}
          />
          <button
            onClick={() => {
              const trimmed = newId.trim()
              if (!trimmed || existingIds.includes(trimmed)) return
              const ops = shaperClassFormToOps(policy.name, trimmed, undefined, blankShaperClassFormValues())
              for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}` })
              setNewId('')
              setShowAdd(false)
              setEditingClass(trimmed)
            }}
            disabled={!newId.trim() || existingIds.includes(newId.trim())}
            className={`bg-accent-600 ${buttonClass}`}
          >
            Add
          </button>
        </div>
      )}
      {policy.classes.length === 0 && <p className="text-xs text-slate-500">No classes yet.</p>}
      {policy.classes.map((cls) => (
        <div key={cls.id} className="mb-2 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">
              #{cls.id} {cls.bandwidth ?? '(no bandwidth)'}
              {cls.ceiling && ` / ceil ${cls.ceiling}`}
            </span>
            <div>
              <button
                onClick={() => setEditingClass(editingClass === cls.id ? null : cls.id)}
                className="text-xs text-accent-500 hover:text-accent-400"
              >
                {editingClass === cls.id ? 'Close' : 'Edit'}
              </button>{' '}
              <button onClick={() => queueDelete(cls.id)} className="ml-2 text-xs text-slate-500 hover:text-danger-500">
                Remove
              </button>
            </div>
          </div>
          {editingClass === cls.id && (
            <div className="mt-2 space-y-2">
              <ShaperClassFields policy={policy} cls={cls} />
              <QosMatchList
                basePath={shaperClassPath(policy.name, cls.id)}
                matches={cls.matches}
                matchGroups={cls.matchGroups}
                availableMatchGroups={availableMatchGroups}
                pathLabel={`qos policy shaper ${policy.name} class ${cls.id}`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ShaperClassFields({ policy, cls }: { policy: QosShaperPolicy; cls: QosShaperClass }) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<ShaperClassFormValues>(shaperClassToFormValues(cls))

  function update<K extends keyof ShaperClassFormValues>(key: K, value: ShaperClassFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = shaperClassFormToOps(policy.name, cls.id, cls, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          {...noExtensionInputProps}
          value={values.bandwidth}
          onChange={(e) => update('bandwidth', e.target.value)}
          placeholder="bandwidth"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.ceiling}
          onChange={(e) => update('ceiling', e.target.value)}
          placeholder="ceiling"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.burst}
          onChange={(e) => update('burst', e.target.value)}
          placeholder="burst"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.priority}
          onChange={(e) => update('priority', e.target.value)}
          placeholder="priority (0-20)"
          className={inputClass}
        />
        <select value={values.queueType} onChange={(e) => update('queueType', e.target.value)} className={inputClass}>
          <option value="fq-codel">fq-codel</option>
          <option value="drop-tail">drop-tail</option>
          <option value="fair-queue">fair-queue</option>
          <option value="priority">priority</option>
          <option value="random-detect">random-detect</option>
        </select>
        <input
          {...noExtensionInputProps}
          value={values.queueLimit}
          onChange={(e) => update('queueLimit', e.target.value)}
          placeholder="queue limit"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.setDscp}
          onChange={(e) => update('setDscp', e.target.value)}
          placeholder="set DSCP"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="description"
          className={inputClass}
        />
      </div>
      <button onClick={submit} className={`mt-2 bg-accent-600 ${buttonClass}`}>
        Save
      </button>
    </div>
  )
}

function ShaperDefaultClassPanel({ policy }: { policy: QosShaperPolicy }) {
  const add = usePendingChangesStore((s) => s.add)
  const before = shaperDefaultClassToFormValues(policy.defaultClass)
  const [values, setValues] = useState(before)

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = shaperDefaultClassFormToOps(policy.name, before, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Default class (unmatched traffic)</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          {...noExtensionInputProps}
          value={values.bandwidth}
          onChange={(e) => update('bandwidth', e.target.value)}
          placeholder="bandwidth"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.ceiling}
          onChange={(e) => update('ceiling', e.target.value)}
          placeholder="ceiling"
          className={inputClass}
        />
        <select value={values.queueType} onChange={(e) => update('queueType', e.target.value)} className={inputClass}>
          <option value="fq-codel">fq-codel</option>
          <option value="drop-tail">drop-tail</option>
          <option value="fair-queue">fair-queue</option>
          <option value="priority">priority</option>
          <option value="random-detect">random-detect</option>
        </select>
        <input
          {...noExtensionInputProps}
          value={values.setDscp}
          onChange={(e) => update('setDscp', e.target.value)}
          placeholder="set DSCP"
          className={inputClass}
        />
      </div>
      <button onClick={submit} className={`mt-2 bg-accent-600 ${buttonClass}`}>
        Save default
      </button>
    </div>
  )
}
