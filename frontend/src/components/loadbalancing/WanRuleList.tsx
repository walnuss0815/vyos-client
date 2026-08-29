import { useState } from 'react'
import {
  addWANRuleInterfaceOps,
  blankWANRuleFormValues,
  deleteWANRuleOp,
  removeWANRuleInterfaceOp,
  wanRuleFormToOps,
  wanRuleToFormValues,
  type WANRuleFormValues,
} from '../../lib/loadBalancingWanForm'
import type { WANMatch, WANRule } from '../../lib/loadBalancingTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

function suggestNextNumber(existing: string[]): string {
  const used = new Set(existing.map(Number))
  for (let n = 10; n < 9999; n += 10) if (!used.has(n)) return String(n)
  return '1'
}

/** `rule <N>` list - matches traffic to distribute across (or exclude
 * from) WAN load-balancing. Each rule's egress `interface <name>`
 * list (with per-interface weight) is a second nesting level, handled
 * by WanRuleInterfacesSection below - same two-level shape as
 * WanInterfaceHealthList's tests. */
export default function WanRuleList({ rules }: { rules: WANRule[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingIds = rules.map((r) => r.id)

  function queueDelete(ruleId: string) {
    add({ op: deleteWANRuleOp(ruleId), label: `delete load-balancing wan rule ${ruleId}` })
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rules</p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditing(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add rule'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-surface-border bg-surface-900 p-4">
          <WanRuleFormPanel ruleId={suggestNextNumber(existingIds)} onDone={() => setShowAdd(false)} />
        </div>
      )}

      {rules.length === 0 && !showAdd && <p className="text-xs text-slate-500">No rules configured yet.</p>}

      <div className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            {editing === rule.id ? (
              <WanRuleFormPanel ruleId={rule.id} rule={rule} onDone={() => setEditing(null)} />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-white">
                    #{rule.id}
                    {rule.description && <span className="ml-2 text-xs text-slate-400">{rule.description}</span>}
                  </span>
                  <div>
                    <button
                      onClick={() => {
                        setEditing(rule.id)
                        setShowAdd(false)
                      }}
                      className="text-xs text-accent-500 hover:text-accent-400"
                    >
                      Edit
                    </button>{' '}
                    <button onClick={() => queueDelete(rule.id)} className="ml-2 text-xs text-slate-500 hover:text-danger-500">
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  {rule.protocol} · {rule.exclude ? 'excluded from LB' : rule.failover ? 'failover' : 'load-balanced'}
                  {rule.inboundInterface && ` · in: ${rule.inboundInterface}`}
                </p>
                <WanRuleInterfacesSection rule={rule} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function MatchFields({
  title,
  values,
  onChange,
}: {
  title: string
  values: WANMatch
  onChange: (key: keyof WANMatch, value: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-2">
        <label className={labelClass}>
          Address
          <input
            {...noExtensionInputProps}
            value={values.address ?? ''}
            onChange={(e) => onChange('address', e.target.value)}
            placeholder="10.0.0.0/24, a range, or !negated"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Port
          <input
            {...noExtensionInputProps}
            value={values.port ?? ''}
            onChange={(e) => onChange('port', e.target.value)}
            placeholder="443, http, or 5000-5010"
            className={inputClass}
          />
        </label>
        <FieldLabel label="Address group" hint="References a named Firewall address-group instead of typing addresses directly.">
          <input
            {...noExtensionInputProps}
            value={values.addressGroup ?? ''}
            onChange={(e) => onChange('addressGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Network group" hint="References a named Firewall network-group (whole CIDR subnets).">
          <input
            {...noExtensionInputProps}
            value={values.networkGroup ?? ''}
            onChange={(e) => onChange('networkGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Port group" hint="References a named Firewall port-group.">
          <input
            {...noExtensionInputProps}
            value={values.portGroup ?? ''}
            onChange={(e) => onChange('portGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Domain group" hint="References a named Firewall domain-group.">
          <input
            {...noExtensionInputProps}
            value={values.domainGroup ?? ''}
            onChange={(e) => onChange('domainGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
      </div>
    </div>
  )
}

function WanRuleFormPanel({ ruleId, rule, onDone }: { ruleId: string; rule?: WANRule; onDone: () => void }) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<WANRuleFormValues>(rule ? wanRuleToFormValues(rule) : blankWANRuleFormValues())

  function update<K extends keyof WANRuleFormValues>(key: K, value: WANRuleFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = wanRuleFormToOps(ruleId, rule, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    onDone()
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Description
          <input
            {...noExtensionInputProps}
            value={values.description}
            onChange={(e) => update('description', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Protocol
          <input
            {...noExtensionInputProps}
            value={values.protocol}
            onChange={(e) => update('protocol', e.target.value)}
            placeholder="all, tcp, udp, tcp_udp, ..."
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Inbound interface
          <input
            {...noExtensionInputProps}
            value={values.inboundInterface}
            onChange={(e) => update('inboundInterface', e.target.value)}
            placeholder="eth0 or any"
            className={`font-mono ${inputClass}`}
          />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.exclude}
            onChange={(e) => update('exclude', e.target.checked)}
            className="accent-accent-500"
          />
          Exclude from load-balancing
          <InfoTooltip text="Matching traffic bypasses WAN load-balancing entirely and uses the main routing table instead - mutually exclusive with failover/limit on VyOS's side." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.failover}
            onChange={(e) => update('failover', e.target.checked)}
            className="accent-accent-500"
          />
          Failover only
          <InfoTooltip text="Matching traffic only moves to another interface on failure, rather than being actively load-balanced across all healthy interfaces." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.perPacketBalancing}
            onChange={(e) => update('perPacketBalancing', e.target.checked)}
            className="accent-accent-500"
          />
          Per-packet balancing
          <InfoTooltip text="Distributes individual packets across interfaces instead of keeping each flow pinned to one interface for its whole lifetime - can cause out-of-order delivery for a single connection." />
        </label>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MatchFields title="Source" values={values.source} onChange={(k, v) => update('source', { ...values.source, [k]: v })} />
        <MatchFields
          title="Destination"
          values={values.destination}
          onChange={(k, v) => update('destination', { ...values.destination, [k]: v })}
        />
      </div>

      <div className="mb-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Rate limit (optional)
          <InfoTooltip text="Leave rate and burst blank to skip rate-limiting entirely for this rule." />
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            {...noExtensionInputProps}
            value={values.limitRate}
            onChange={(e) => update('limitRate', e.target.value)}
            placeholder="rate"
            className={inputClass}
          />
          <select value={values.limitPeriod} onChange={(e) => update('limitPeriod', e.target.value)} className={inputClass}>
            <option value="second">per second</option>
            <option value="minute">per minute</option>
            <option value="hour">per hour</option>
          </select>
          <input
            {...noExtensionInputProps}
            value={values.limitBurst}
            onChange={(e) => update('limitBurst', e.target.value)}
            placeholder="burst"
            className={inputClass}
          />
          <select
            value={values.limitThreshold}
            onChange={(e) => update('limitThreshold', e.target.value)}
            className={inputClass}
          >
            <option value="below">below</option>
            <option value="above">above</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
          {rule ? 'Save' : 'Add rule'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  )
}

function WanRuleInterfacesSection({ rule }: { rule: WANRule }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = rule.interfaces.some((i) => i.name === trimmedName)
  const valid = trimmedName !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addWANRuleInterfaceOps(rule.id, trimmedName, weight)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setName('')
    setWeight('')
    setShowAdd(false)
  }

  function queueRemove(ifaceName: string) {
    const op = removeWANRuleInterfaceOp(rule.id, ifaceName)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="mt-3 border-t border-surface-border pt-3">
      <p className="mb-1 text-xs text-slate-500">Egress interfaces</p>
      {rule.interfaces.map((iface) => (
        <div key={iface.name} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {iface.name} (weight {iface.weight})
          </span>
          <button onClick={() => queueRemove(iface.name)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {rule.interfaces.length === 0 && !rule.exclude && (
        <p className="text-xs text-slate-500">No egress interfaces configured yet.</p>
      )}

      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add interface'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input
            {...noExtensionInputProps}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="eth0"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="weight (default 1)"
            className={inputClass}
          />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="col-span-3 text-xs text-danger-500">This interface is already used by this rule.</p>}
        </div>
      )}
    </div>
  )
}
