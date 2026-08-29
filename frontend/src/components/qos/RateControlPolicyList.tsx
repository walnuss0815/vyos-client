import { useState } from 'react'
import {
  blankRateControlFormValues,
  deleteRateControlPolicyOp,
  rateControlFormToOps,
  rateControlToFormValues,
  type RateControlFormValues,
} from '../../lib/qosSimplePolicyForm'
import type { QosRateControlPolicy } from '../../lib/qosTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** `qos policy rate-control <name>` list - a plain Token Bucket
 * Filter, the simplest real rate limiter (no classes, no match rules,
 * CPU-cheap). */
export default function RateControlPolicyList({ policies }: { policies: QosRateControlPolicy[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = policies.map((p) => p.name)

  function queueDelete(name: string) {
    add({ op: deleteRateControlPolicyOp(name), label: `delete qos policy rate-control ${name}` })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rate control (TBF)</p>
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
                const ops = rateControlFormToOps(trimmed, undefined, blankRateControlFormValues())
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

      {policies.length === 0 && !showAdd && <p className="text-xs text-slate-500">No rate-control policies configured yet.</p>}

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
            {editing === policy.name ? (
              <RateControlFields policy={policy} />
            ) : (
              <p className="mt-1 text-xs text-slate-500">{policy.bandwidth ?? '(no bandwidth set)'}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function RateControlFields({ policy }: { policy: QosRateControlPolicy }) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<RateControlFormValues>(rateControlToFormValues(policy))

  function update<K extends keyof RateControlFormValues>(key: K, value: RateControlFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = rateControlFormToOps(policy.name, policy, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="mt-2 space-y-2">
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
          value={values.burst}
          onChange={(e) => update('burst', e.target.value)}
          placeholder="burst"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.latency}
          onChange={(e) => update('latency', e.target.value)}
          placeholder="latency (ms, default 50)"
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
