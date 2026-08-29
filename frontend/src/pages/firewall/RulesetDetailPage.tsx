import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import RuleForm from '../../components/firewall/RuleForm'
import { rulePath, rulesetPath, type RulesetRef } from '../../lib/firewallParse'
import { reorderRuleOps } from '../../lib/firewallRuleForm'
import type { FirewallRule, RuleAction } from '../../lib/firewallTypes'
import { useFirewallConfig } from '../../hooks/useFirewallConfig'
import { usePendingChangesStore } from '../../store/pendingChanges'
import { inputClass } from '../../lib/formStyles'
import InfoTooltip from '../../components/InfoTooltip'

const ACTION_COLOR: Partial<Record<RuleAction, string>> = {
  accept: 'text-success-500',
  drop: 'text-danger-500',
  reject: 'text-danger-500',
  jump: 'text-accent-500',
}

export default function RulesetDetailPage() {
  const params = useParams<{ family: string; kind: string; id: string }>()
  const { rulesets, isLoading, isError } = useFirewallConfig()
  const [showAdd, setShowAdd] = useState(false)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  if (
    (params.family !== 'ipv4' && params.family !== 'ipv6') ||
    (params.kind !== 'base' && params.kind !== 'custom')
  ) {
    return <Navigate to="/firewall/rulesets" replace />
  }
  const family: 'ipv4' | 'ipv6' = params.family
  const kind: 'base' | 'custom' = params.kind
  const decodedId = decodeURIComponent(params.id ?? '')
  const ref: RulesetRef = { id: decodedId, kind, family }

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load firewall configuration.</p>

  const ruleset = rulesets.find((rs) => rs.kind === kind && rs.family === family && rs.id === decodedId)
  if (!ruleset) {
    return (
      <div>
        <Link to="/firewall/rulesets" className="text-xs text-accent-500 hover:text-accent-400">
          ← Back to rulesets
        </Link>
        <p className="mt-4 text-sm text-slate-400">
          Ruleset "{decodedId}" not found (it may not have any configuration yet, or was just deleted).
        </p>
      </div>
    )
  }

  function queueSetDefaultAction(value: string) {
    add({
      op: { op: 'set', path: rulesetPath(ref, 'default-action'), value },
      label: `set ${decodedId} default-action '${value}'`,
    })
  }

  function queueDeleteRule(ruleNumber: string) {
    add({
      op: { op: 'delete', path: rulePath(ref, ruleNumber) },
      label: `delete ${decodedId} rule ${ruleNumber}`,
    })
    // If this rule's own edit form is still open, close it: RuleForm's
    // onDone diffs the form's current field values against `rule` and
    // queues `set` ops for whatever changed - submitting it after the
    // delete queued above would push those `set` ops for the exact
    // same path *after* the delete, resurrecting the rule with the
    // edited values instead of actually deleting it. Nothing else
    // clears `editingRule` on delete otherwise, since deleting a
    // *different* rule than the one being edited is entirely safe to
    // leave the form open for.
    if (editingRule === ruleNumber) setEditingRule(null)
  }

  const rules = ruleset.rules

  // VyOS orders rule evaluation strictly by rule number and has no
  // "move" primitive - reorderRuleOps computes whatever
  // delete+recreate ops are needed (ideally just the moved rule, only
  // falling back to renumbering the whole ruleset when no free number
  // exists between its new neighbors - see that function's own doc
  // comment). Used by both the drag handle and the Move up/down
  // buttons (the latter also serving as a keyboard/screen-reader-
  // accessible alternative to drag-and-drop, not just a fallback).
  // Captures `rules` (not `ruleset.rules` directly) since TypeScript's
  // control-flow narrowing of `ruleset` from the undefined-check above
  // doesn't persist into this nested function's body.
  function reorderRule(fromIndex: number, toIndex: number) {
    const ops = reorderRuleOps(ref, rules, fromIndex, toIndex)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
  }

  const existingNumbers = rules.map((r) => r.number)
  const editing = editingRule ? ruleset.rules.find((r) => r.number === editingRule) : undefined

  return (
    <div>
      <Link to="/firewall/rulesets" className="text-xs text-accent-500 hover:text-accent-400">
        ← Back to rulesets
      </Link>

      <div className="mt-2 mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-base font-medium text-white">{decodedId}</h2>
            <span className="rounded bg-accent-600/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-accent-500">
              {family}
            </span>
          </div>
          {ruleset.description && <p className="text-xs text-slate-400">{ruleset.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Default action
            {kind === 'custom' && (
              <InfoTooltip text="What happens to a packet that falls through without matching any rule above. return exits back to whichever chain jumped here, resuming evaluation there instead of dropping/accepting outright." />
            )}
            <select
              value={ruleset.defaultAction ?? 'accept'}
              onChange={(e) => queueSetDefaultAction(e.target.value)}
              className={inputClass}
            >
              {kind === 'base' ? (
                <>
                  <option value="accept">accept</option>
                  <option value="drop">drop</option>
                </>
              ) : (
                <>
                  <option value="accept">accept</option>
                  <option value="drop">drop</option>
                  <option value="reject">reject</option>
                  <option value="return">return</option>
                </>
              )}
            </select>
          </label>
          <button
            onClick={() => {
              setShowAdd((v) => !v)
              setEditingRule(null)
            }}
            className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500"
          >
            {showAdd ? 'Cancel' : '+ Add rule'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="mb-4">
          <RuleForm
            rulesetRef={ref}
            existingNumbers={existingNumbers}
            onDone={() => setShowAdd(false)}
          />
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <RuleForm
            rulesetRef={ref}
            rule={editing}
            existingNumbers={existingNumbers}
            onDone={() => setEditingRule(null)}
          />
        </div>
      )}

      {ruleset.rules.length > 1 && (
        <p className="mb-2 text-xs text-slate-500">
          Drag the ⠿ handle (or use the ▲▼ buttons) to reorder rules. VyOS evaluates rules in
          numeric order - reordering renumbers the moved rule (and, only when no free number is
          available between its new neighbors, the rest of the ruleset too).
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Protocol</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Destination</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {ruleset.rules.map((rule, index) => (
              <tr
                key={rule.number}
                draggable
                onDragStart={() => setDraggedIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverIndex(index)
                }}
                onDragLeave={() => setDragOverIndex((v) => (v === index ? null : v))}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggedIndex !== null) reorderRule(draggedIndex, index)
                  setDraggedIndex(null)
                  setDragOverIndex(null)
                }}
                onDragEnd={() => {
                  setDraggedIndex(null)
                  setDragOverIndex(null)
                }}
                className={`border-t border-surface-border bg-surface-900/50 hover:bg-surface-800 ${rule.disabled ? 'opacity-50' : ''} ${dragOverIndex === index ? 'border-t-2 border-t-accent-500' : ''}`}
              >
                <td className="cursor-grab px-3 py-2 text-slate-600 active:cursor-grabbing" aria-hidden="true">
                  ⠿
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-300">{rule.number}</td>
                <td className={`px-3 py-2 font-mono text-xs font-medium ${rule.action ? ACTION_COLOR[rule.action] ?? 'text-slate-300' : 'text-slate-500'}`}>
                  {rule.action ?? '—'}
                  {rule.disabled && <span className="ml-1 text-slate-500">(disabled)</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{rule.protocol ?? 'all'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{summarizeMatch(rule.source)}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{summarizeMatch(rule.destination)}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{rule.description}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => reorderRule(index, index - 1)}
                    disabled={index === 0}
                    aria-label={`Move rule ${rule.number} up`}
                    className="text-xs text-slate-500 hover:text-accent-500 disabled:opacity-30 disabled:hover:text-slate-500"
                  >
                    ▲
                  </button>{' '}
                  <button
                    onClick={() => reorderRule(index, index + 1)}
                    disabled={index === ruleset.rules.length - 1}
                    aria-label={`Move rule ${rule.number} down`}
                    className="text-xs text-slate-500 hover:text-accent-500 disabled:opacity-30 disabled:hover:text-slate-500"
                  >
                    ▼
                  </button>{' '}
                  <button
                    onClick={() => {
                      setEditingRule(rule.number)
                      setShowAdd(false)
                    }}
                    className="ml-1 text-xs text-accent-500 hover:text-accent-400"
                  >
                    Edit
                  </button>{' '}
                  <button
                    onClick={() => queueDeleteRule(rule.number)}
                    className="ml-2 text-xs text-slate-500 hover:text-danger-500"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {ruleset.rules.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">
                  No rules yet. All traffic hits the default action above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function summarizeMatch(match: FirewallRule['source']): string {
  const parts: string[] = []
  if (match.address) parts.push(match.address)
  if (match.port) parts.push(`:${match.port}`)
  if (match.addressGroup) parts.push(`grp:${match.addressGroup}`)
  if (match.networkGroup) parts.push(`grp:${match.networkGroup}`)
  if (match.portGroup) parts.push(`grp:${match.portGroup}`)
  if (match.macAddress) parts.push(match.macAddress)
  if (match.macGroup) parts.push(`grp:${match.macGroup}`)
  if (match.domainGroup) parts.push(`grp:${match.domainGroup}`)
  return parts.length > 0 ? parts.join(' ') : 'any'
}
