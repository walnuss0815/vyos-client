import { useState } from 'react'
import RouteMapRuleForm from './RouteMapRuleForm'
import {
  blankRouteMapRuleFormValues,
  deleteRouteMapOp,
  deleteRouteMapRuleOp,
  routeMapFormToOps,
  routeMapRuleFormToOps,
} from '../../lib/routeMapForm'
import type { RouteMap } from '../../lib/policyTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function RouteMapSection({ routeMaps }: { routeMaps: RouteMap[] }) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [firstRuleAction, setFirstRuleAction] = useState<'' | 'permit' | 'deny'>('')
  const [firstRuleProtocol, setFirstRuleProtocol] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = routeMaps.some((m) => m.name === trimmedName)
  const valid = trimmedName !== '' && !taken

  function submitCreate() {
    if (!valid) return
    const values = { description }
    const ops = routeMapFormToOps(trimmedName, undefined, values)
    if (ops.length === 0) {
      // A bare name with no description still needs its tag node
      // created explicitly, unlike every other "creation" flow in
      // this app where the first meaningful field auto-creates it.
      add({
        op: { op: 'set', path: ['policy', 'route-map', trimmedName] },
        label: `set policy route-map ${trimmedName}`,
      })
    } else {
      for (const op of ops) {
        add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
      }
    }
    // A route-map's rules used to only be configurable AFTER the
    // route-map already existed - RulesSection/RouteMapRuleForm only
    // ever operate on an already-fetched route-map. Queuing a first
    // one here, in the same commit as the route-map itself, avoids a
    // detour through commit+refetch.
    if (firstRuleAction || firstRuleProtocol.trim()) {
      const ruleOps = routeMapRuleFormToOps(trimmedName, '10', undefined, {
        ...blankRouteMapRuleFormValues(),
        action: firstRuleAction,
        match: { ...blankRouteMapRuleFormValues().match, protocol: firstRuleProtocol.trim() },
      })
      for (const op of ruleOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setName('')
    setDescription('')
    setFirstRuleAction('')
    setFirstRuleProtocol('')
    setShowCreate(false)
  }

  function queueDelete(mapName: string) {
    const op = deleteRouteMapOp(mapName)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Route maps filter and manipulate routes - used for BGP neighbor/peer-group filtering,
          redistribution filtering, and more. A curated core of options is covered here; anything
          not shown is still editable via the Config Tree.
        </p>
        <button onClick={() => setShowCreate((v) => !v)} className={`shrink-0 bg-accent-600 ${buttonClass}`}>
          {showCreate ? 'Cancel' : '+ New route-map'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Name *
              <input
                {...noExtensionInputProps}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
              {taken && <span className="text-danger-500">This route-map already exists.</span>}
            </label>
            <label className={labelClass}>
              Description
              <input
                {...noExtensionInputProps}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">First rule #10 (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>
                Action
                <select
                  value={firstRuleAction}
                  onChange={(e) => setFirstRuleAction(e.target.value as '' | 'permit' | 'deny')}
                  className={inputClass}
                >
                  <option value="">(default: permit)</option>
                  <option value="permit">permit</option>
                  <option value="deny">deny</option>
                </select>
              </label>
              <label className={labelClass}>
                Match protocol
                <input
                  {...noExtensionInputProps}
                  value={firstRuleProtocol}
                  onChange={(e) => setFirstRuleProtocol(e.target.value)}
                  placeholder="bgp, ospf, connected, static..."
                  className={inputClass}
                />
              </label>
            </div>
          </div>
          <button onClick={submitCreate} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
            Queue route-map creation
          </button>
        </div>
      )}

      <div className="space-y-3">
        {routeMaps.map((map) => (
          <div key={map.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="font-mono text-sm font-medium text-white">{map.name}</span>
                {map.description && <p className="text-xs text-slate-400">{map.description}</p>}
              </div>
              <button
                onClick={() => queueDelete(map.name)}
                className="text-xs text-slate-500 hover:text-danger-500"
              >
                Delete route-map
              </button>
            </div>
            <RulesSection map={map} />
          </div>
        ))}
        {routeMaps.length === 0 && <p className="text-xs text-slate-500">No route-maps configured yet.</p>}
      </div>
    </div>
  )
}

function RulesSection({ map }: { map: RouteMap }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNumbers = map.rules.map((r) => r.number)
  const editing = editingRule ? map.rules.find((r) => r.number === editingRule) : undefined

  function queueDelete(ruleNumber: string) {
    const op = deleteRouteMapRuleOp(map.name, ruleNumber)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-slate-500">Rules</p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditingRule(null)
          }}
          className="text-xs text-accent-500 hover:text-accent-400"
        >
          {showAdd ? 'Cancel' : '+ Add rule'}
        </button>
      </div>

      {showAdd && (
        <div className="my-2">
          <RouteMapRuleForm mapName={map.name} existingNumbers={existingNumbers} onDone={() => setShowAdd(false)} />
        </div>
      )}

      {editing && (
        <div className="my-2">
          <RouteMapRuleForm
            mapName={map.name}
            rule={editing}
            existingNumbers={existingNumbers}
            onDone={() => setEditingRule(null)}
          />
        </div>
      )}

      <ul className="space-y-1">
        {map.rules.map((rule) => (
          <li key={rule.number} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              #{rule.number} {rule.action ?? 'permit'}
              {rule.description && <span className="text-slate-500"> - {rule.description}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setEditingRule(rule.number)
                  setShowAdd(false)
                }}
                className="text-accent-500 hover:text-accent-400"
              >
                Edit
              </button>
              <button onClick={() => queueDelete(rule.number)} className="text-slate-500 hover:text-danger-500">
                Remove
              </button>
            </span>
          </li>
        ))}
        {map.rules.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
    </div>
  )
}
