import { useState } from 'react'
import NATStaticRuleForm from './NATStaticRuleForm'
import { deleteStaticRuleOp } from '../../lib/natStaticForm'
import type { NATStaticRule } from '../../lib/natTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function NATStaticRuleList({
  rules,
  isLoading,
}: {
  rules: NATStaticRule[]
  isLoading: boolean
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(ruleNumber: string) {
    const op = deleteStaticRuleOp(ruleNumber)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const existingNumbers = rules.map((r) => r.number)
  const editing = editingRule ? rules.find((r) => r.number === editingRule) : undefined

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          One-to-one NAT: dedicates a single external address to a single internal address, for
          both directions of traffic - useful for protocols without a notion of ports, such as
          GRE, or when a whole internal host should simply appear as a public address.
        </p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditingRule(null)
          }}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add rule'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4">
          <NATStaticRuleForm existingNumbers={existingNumbers} onDone={() => setShowAdd(false)} />
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <NATStaticRuleForm rule={editing} existingNumbers={existingNumbers} onDone={() => setEditingRule(null)} />
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.number}
            className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-900 px-3 py-2"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-500">#{rule.number}</span>
                <span className="font-mono text-sm text-white">
                  {rule.destinationAddress} → {rule.translationAddress}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {rule.description || 'no description'}
                {rule.interfaceName && <span> · {rule.interfaceName}</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setEditingRule(rule.number)
                  setShowAdd(false)
                }}
                className="text-xs text-accent-500 hover:text-accent-400"
              >
                Edit
              </button>
              <button
                onClick={() => queueDelete(rule.number)}
                className="text-xs text-slate-500 hover:text-danger-500"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!isLoading && rules.length === 0 && (
          <p className="text-xs text-slate-500">No static NAT rules configured yet.</p>
        )}
      </div>
    </div>
  )
}
