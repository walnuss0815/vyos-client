import { useState } from 'react'
import {
  blankSimpleClassfulClassFormValues,
  deleteSimpleClassfulClassOp,
  deleteSimpleClassfulPolicyOp,
  simpleClassfulClassFormToOps,
  simpleClassfulClassPath,
  simpleClassfulClassToFormValues,
  simpleClassfulDefaultClassFormToOps,
  simpleClassfulDefaultClassToFormValues,
  simpleClassfulPolicyFormToOps,
  type SimpleClassfulClassFormValues,
  type SimpleClassfulPolicyType,
} from '../../lib/qosSimpleClassfulForm'
import type { QosPriorityQueuePolicy, QosRoundRobinPolicy, QosSimpleClassfulClass } from '../../lib/qosTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import QosMatchList from './QosMatchList'

type Policy = QosPriorityQueuePolicy | QosRoundRobinPolicy

/** Shared list/form for `priority-queue` and `round-robin` - both
 * classful but far simpler than shaper/shaper-hfsc (no bandwidth/
 * ceiling, just an inner qdisc selection per class - see
 * qosSimpleClassfulForm.ts's own doc comment). One component covers
 * both types via the `policyType` prop rather than duplicating
 * near-identical list/form code twice. */
export default function SimpleClassfulPolicyList({
  policyType,
  title,
  classIdHint,
  policies,
  availableMatchGroups,
}: {
  policyType: SimpleClassfulPolicyType
  title: string
  classIdHint: string
  policies: Policy[]
  availableMatchGroups: string[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = policies.map((p) => p.name)

  function queueDelete(name: string) {
    add({
      op: deleteSimpleClassfulPolicyOp(policyType, name),
      label: `delete qos policy ${policyType} ${name}`,
    })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
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
              className={`font-mono ${inputClass}`}
            />
          </label>
          {newName.trim() !== '' && !existingNames.includes(newName.trim()) && (
            <button
              onClick={() => {
                const trimmed = newName.trim()
                const ops = simpleClassfulPolicyFormToOps(policyType, trimmed, undefined, { description: '' })
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

      {policies.length === 0 && !showAdd && <p className="text-xs text-slate-500">No policies configured yet.</p>}

      <div className="space-y-3">
        {policies.map((policy) => (
          <div key={policy.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-white">{policy.name}</span>
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
            {policy.description && <p className="text-xs text-slate-400">{policy.description}</p>}
            <p className="mt-1 text-xs text-slate-500">
              {policy.classes.length} class{policy.classes.length === 1 ? '' : 'es'}
            </p>

            {editing === policy.name && (
              <div className="mt-3 space-y-3 border-t border-surface-border pt-3">
                <ClassList
                  policyType={policyType}
                  policy={policy}
                  classIdHint={classIdHint}
                  availableMatchGroups={availableMatchGroups}
                />
                <DefaultClassPanel policyType={policyType} policy={policy} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ClassList({
  policyType,
  policy,
  classIdHint,
  availableMatchGroups,
}: {
  policyType: SimpleClassfulPolicyType
  policy: Policy
  classIdHint: string
  availableMatchGroups: string[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingClass, setEditingClass] = useState<string | null>(null)
  const [newId, setNewId] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const existingIds = policy.classes.map((c) => c.id)

  function queueDelete(classId: string) {
    add({
      op: deleteSimpleClassfulClassOp(policyType, policy.name, classId),
      label: `delete qos policy ${policyType} ${policy.name} class ${classId}`,
    })
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
            placeholder={classIdHint}
            className={inputClass}
          />
          <button
            onClick={() => {
              const trimmed = newId.trim()
              if (!trimmed || existingIds.includes(trimmed)) return
              // Both types' per-class queue-type defaults to
              // 'drop-tail' - only the *default class* differs
              // (round-robin's own default class defaults to
              // 'fair-queue' instead, handled separately below).
              const ops = simpleClassfulClassFormToOps(
                policyType,
                policy.name,
                trimmed,
                undefined,
                blankSimpleClassfulClassFormValues('drop-tail'),
              )
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
              #{cls.id} {cls.queueType}
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
              <ClassFields policyType={policyType} policy={policy} cls={cls} />
              <QosMatchList
                basePath={simpleClassfulClassPath(policyType, policy.name, cls.id)}
                matches={cls.matches}
                matchGroups={cls.matchGroups}
                availableMatchGroups={availableMatchGroups}
                pathLabel={`qos policy ${policyType} ${policy.name} class ${cls.id}`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ClassFields({
  policyType,
  policy,
  cls,
}: {
  policyType: SimpleClassfulPolicyType
  policy: Policy
  cls: QosSimpleClassfulClass
}) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<SimpleClassfulClassFormValues>(simpleClassfulClassToFormValues(cls))

  function update<K extends keyof SimpleClassfulClassFormValues>(key: K, value: SimpleClassfulClassFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = simpleClassfulClassFormToOps(policyType, policy.name, cls.id, cls, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select value={values.queueType} onChange={(e) => update('queueType', e.target.value)} className={inputClass}>
          <option value="drop-tail">drop-tail</option>
          <option value="fair-queue">fair-queue</option>
          <option value="fq-codel">fq-codel</option>
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
        {policyType === 'round-robin' && (
          <input
            {...noExtensionInputProps}
            value={values.quantum}
            onChange={(e) => update('quantum', e.target.value)}
            placeholder="quantum (bytes)"
            className={inputClass}
          />
        )}
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

function DefaultClassPanel({ policyType, policy }: { policyType: SimpleClassfulPolicyType; policy: Policy }) {
  const add = usePendingChangesStore((s) => s.add)
  const before = simpleClassfulDefaultClassToFormValues(policy.defaultClass)
  const [values, setValues] = useState(before)

  function submit() {
    const ops = simpleClassfulDefaultClassFormToOps(policyType, policy.name, before, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Default class (unmatched traffic)</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select
          value={values.queueType}
          onChange={(e) => setValues((v) => ({ ...v, queueType: e.target.value }))}
          className={inputClass}
        >
          <option value="drop-tail">drop-tail</option>
          <option value="fair-queue">fair-queue</option>
          <option value="fq-codel">fq-codel</option>
          <option value="priority">priority</option>
          <option value="random-detect">random-detect</option>
        </select>
        <input
          {...noExtensionInputProps}
          value={values.queueLimit}
          onChange={(e) => setValues((v) => ({ ...v, queueLimit: e.target.value }))}
          placeholder="queue limit"
          className={inputClass}
        />
      </div>
      <button onClick={submit} className={`mt-2 bg-accent-600 ${buttonClass}`}>
        Save default
      </button>
    </div>
  )
}
