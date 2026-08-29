import { useState } from 'react'
import {
  blankFqCodelFormValues,
  deleteFqCodelPolicyOp,
  fqCodelFormToOps,
  fqCodelToFormValues,
  type FqCodelFormValues,
} from '../../lib/qosSimplePolicyForm'
import type { QosFqCodelPolicy } from '../../lib/qosTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** `qos policy fq-codel <name>` list - Fair Queuing with Controlled
 * Delay, a simple work-conserving anti-bufferbloat AQM with no
 * classes/match rules. */
export default function FqCodelPolicyList({ policies }: { policies: QosFqCodelPolicy[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = policies.map((p) => p.name)

  function queueDelete(name: string) {
    add({ op: deleteFqCodelPolicyOp(name), label: `delete qos policy fq-codel ${name}` })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">FQ-CoDel</p>
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
                const ops = fqCodelFormToOps(trimmed, undefined, blankFqCodelFormValues())
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

      {policies.length === 0 && !showAdd && <p className="text-xs text-slate-500">No FQ-CoDel policies configured yet.</p>}

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
                  {editing === policy.name ? 'Close' : 'Edit'}
                </button>{' '}
                <button onClick={() => queueDelete(policy.name)} className="ml-2 text-xs text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {editing === policy.name && <FqCodelFields policy={policy} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function FqCodelFields({ policy }: { policy: QosFqCodelPolicy }) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<FqCodelFormValues>(fqCodelToFormValues(policy))

  function update<K extends keyof FqCodelFormValues>(key: K, value: FqCodelFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = fqCodelFormToOps(policy.name, policy, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          {...noExtensionInputProps}
          value={values.target}
          onChange={(e) => update('target', e.target.value)}
          placeholder="target (ms)"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.interval}
          onChange={(e) => update('interval', e.target.value)}
          placeholder="interval (ms)"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.flows}
          onChange={(e) => update('flows', e.target.value)}
          placeholder="flows"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.codelQuantum}
          onChange={(e) => update('codelQuantum', e.target.value)}
          placeholder="codel quantum"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.queueLimit}
          onChange={(e) => update('queueLimit', e.target.value)}
          placeholder="queue limit (2-10999)"
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
      <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
        Save
      </button>
    </div>
  )
}
