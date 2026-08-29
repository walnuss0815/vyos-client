import { useState } from 'react'
import {
  blankCakeFormValues,
  cakeFormToOps,
  cakeToFormValues,
  deleteCakePolicyOp,
  type CakeFormValues,
} from '../../lib/qosSimplePolicyForm'
import { QOS_CAKE_FLOW_ISOLATION_MODES, type QosCakePolicy } from '../../lib/qosTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** `qos policy cake <name>` list - CAKE, a modern "just works"
 * bufferbloat-fighting qdisc with no classes/match rules of its own
 * (a single monolithic queue with built-in flow isolation). */
export default function CakePolicyList({ policies }: { policies: QosCakePolicy[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = policies.map((p) => p.name)

  function queueDelete(name: string) {
    add({ op: deleteCakePolicyOp(name), label: `delete qos policy cake ${name}` })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">CAKE</p>
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
                const ops = cakeFormToOps(trimmed, undefined, blankCakeFormValues())
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

      {policies.length === 0 && !showAdd && <p className="text-xs text-slate-500">No CAKE policies configured yet.</p>}

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
              <CakeFields policy={policy} />
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                {policy.bandwidth ?? '(auto)'} · {policy.flowIsolation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CakeFields({ policy }: { policy: QosCakePolicy }) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<CakeFormValues>(cakeToFormValues(policy))

  function update<K extends keyof CakeFormValues>(key: K, value: CakeFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = cakeFormToOps(policy.name, policy, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          {...noExtensionInputProps}
          value={values.bandwidth}
          onChange={(e) => update('bandwidth', e.target.value)}
          placeholder="bandwidth (optional)"
          className={inputClass}
        />
        <select
          value={values.flowIsolation}
          onChange={(e) => update('flowIsolation', e.target.value)}
          className={inputClass}
        >
          {QOS_CAKE_FLOW_ISOLATION_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          {...noExtensionInputProps}
          value={values.rtt}
          onChange={(e) => update('rtt', e.target.value)}
          placeholder="RTT (ms, default 100)"
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
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.flowIsolationNat}
            onChange={(e) => update('flowIsolationNat', e.target.checked)}
            className="accent-accent-500"
          />
          NAT lookup before flow isolation
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.noSplitGso}
            onChange={(e) => update('noSplitGso', e.target.checked)}
            className="accent-accent-500"
          />
          Don't split GSO super-packets
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.ackFilterAggressive}
            onChange={(e) => update('ackFilterAggressive', e.target.checked)}
            className="accent-accent-500"
          />
          Aggressive TCP ACK filtering
        </label>
      </div>
      <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
        Save
      </button>
    </div>
  )
}
