import { useState } from 'react'
import NATRuleForm from './NATRuleForm'
import { deleteRuleOp } from '../../lib/natRuleForm'
import type { NATMatch, NATRule, NATRuleKind } from '../../lib/natTypes'
import { usePendingChangesStore } from '../../store/pendingChanges'

interface NATRuleListProps {
  kind: NATRuleKind
  rules: NATRule[]
  isLoading: boolean
}

/** Table of source or destination NAT rules - mirrors
 * RulesetDetailPage.tsx's table-plus-toggleable-forms structure, minus
 * drag-and-drop reordering (not part of this app's NAT v1 scope - see
 * docs/roadmap.md; renumber by deleting and recreating, or use the
 * Config Tree page). */
export default function NATRuleList({ kind, rules, isLoading }: NATRuleListProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(ruleNumber: string) {
    const op = deleteRuleOp(kind, ruleNumber)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const existingNumbers = rules.map((r) => r.number)
  const editing = editingRule ? rules.find((r) => r.number === editingRule) : undefined
  const noun = kind === 'source' ? 'Source NAT' : 'Destination NAT'

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {kind === 'source'
            ? 'Rewrites the source address of outbound packets - masquerading private hosts behind a public address, or NAT pools for larger networks.'
            : 'Rewrites the destination address of inbound packets - port forwards, or redirecting traffic to the router itself.'}
        </p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditingRule(null)
          }}
          className="shrink-0 rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500"
        >
          {showAdd ? 'Cancel' : '+ Add rule'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4">
          <NATRuleForm kind={kind} existingNumbers={existingNumbers} onDone={() => setShowAdd(false)} />
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <NATRuleForm
            kind={kind}
            rule={editing}
            existingNumbers={existingNumbers}
            onDone={() => setEditingRule(null)}
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Interface</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Destination</th>
              <th className="px-3 py-2">Translation</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr
                key={rule.number}
                className={`border-t border-surface-border bg-surface-900/50 hover:bg-surface-800 ${rule.disabled ? 'opacity-50' : ''}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-slate-300">{rule.number}</td>
                <td className="px-3 py-2 text-xs text-slate-400">
                  {rule.description}
                  {rule.disabled && <span className="ml-1 text-slate-500">(disabled)</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{rule.interfaceName ?? 'any'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{summarizeMatch(rule.source)}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{summarizeMatch(rule.destination)}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{summarizeTranslation(rule)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setEditingRule(rule.number)
                      setShowAdd(false)
                    }}
                    className="text-xs text-accent-500 hover:text-accent-400"
                  >
                    Edit
                  </button>{' '}
                  <button
                    onClick={() => queueDelete(rule.number)}
                    className="ml-2 text-xs text-slate-500 hover:text-danger-500"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && rules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                  No {noun.toLowerCase()} rules configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function summarizeMatch(match: NATMatch): string {
  const parts: string[] = []
  if (match.address) parts.push(match.address)
  if (match.port) parts.push(`:${match.port}`)
  if (match.addressGroup) parts.push(`grp:${match.addressGroup}`)
  if (match.networkGroup) parts.push(`grp:${match.networkGroup}`)
  if (match.portGroup) parts.push(`grp:${match.portGroup}`)
  return parts.length > 0 ? parts.join(' ') : 'any'
}

function summarizeTranslation(rule: NATRule): string {
  if (rule.redirectPort) return `redirect :${rule.redirectPort}`
  const parts: string[] = []
  if (rule.translationAddress) parts.push(rule.translationAddress)
  if (rule.translationPort) parts.push(`:${rule.translationPort}`)
  return parts.length > 0 ? parts.join(' ') : '—'
}
