import { useState } from 'react'
import ChipList from '../ChipList'
import {
  blankLocalRouteFormValues,
  deleteLocalRouteOp,
  localRouteFormToOps,
  localRouteToFormValues,
  type LocalRouteFormValues,
} from '../../lib/localRouteForm'
import { localRouteRulePath } from '../../lib/policyParse'
import type { LocalRouteFamily, LocalRouteRule } from '../../lib/policyTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'

export default function LocalRouteSection({
  family,
  rules,
}: {
  family: LocalRouteFamily
  rules: LocalRouteRule[]
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNumbers = rules.map((r) => r.number)
  const editing = editingRule ? rules.find((r) => r.number === editingRule) : undefined

  function queueDelete(ruleNumber: string) {
    const op = deleteLocalRouteOp(family, ruleNumber)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Policy-based routing: route matching packets via a specific table or VRF, based on
          source/destination address/port, protocol, firewall mark, or inbound interface -
          evaluated before normal routing, independent of route-maps.
        </p>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingRule(null)
          }}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New rule'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4">
          <RuleForm family={family} existingNumbers={existingNumbers} onDone={() => setShowCreate(false)} />
        </div>
      )}

      {editing && (
        <div className="mb-4">
          <RuleForm
            family={family}
            rule={editing}
            existingNumbers={existingNumbers}
            onDone={() => setEditingRule(null)}
          />
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.number} className="rounded-lg border border-surface-border bg-surface-900 px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-sm text-white">
                #{rule.number}
                {rule.table && <span className="ml-1 text-xs text-slate-500">table {rule.table}</span>}
                {rule.vrf && <span className="ml-1 text-xs text-slate-500">vrf {rule.vrf}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingRule(rule.number)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(rule.number)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-slate-500">Source addresses</p>
                <ChipList
                  values={rule.sourceAddresses}
                  basePath={localRouteRulePath(family, rule.number, 'source')}
                  leaf="address"
                  pathLabel={`policy local-route${family === 'ipv6' ? '6' : ''} rule ${rule.number} source address`}
                  placeholder={family === 'ipv6' ? '2001:db8::/32' : '192.0.2.0/24'}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-slate-500">Destination addresses</p>
                <ChipList
                  values={rule.destinationAddresses}
                  basePath={localRouteRulePath(family, rule.number, 'destination')}
                  leaf="address"
                  pathLabel={`policy local-route${family === 'ipv6' ? '6' : ''} rule ${rule.number} destination address`}
                  placeholder={family === 'ipv6' ? '2001:db8::/32' : '192.0.2.0/24'}
                />
              </div>
            </div>
          </div>
        ))}
        {rules.length === 0 && <p className="text-xs text-slate-500">No rules configured yet.</p>}
      </div>
    </div>
  )
}

function RuleForm({
  family,
  rule,
  existingNumbers,
  onDone,
}: {
  family: LocalRouteFamily
  rule?: LocalRouteRule
  existingNumbers: string[]
  onDone: () => void
}) {
  const [ruleNumber, setRuleNumber] = useState(rule?.number ?? '')
  const [values, setValues] = useState<LocalRouteFormValues>(
    rule ? localRouteToFormValues(rule) : blankLocalRouteFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = rule === undefined
  const numberTaken = isCreate && existingNumbers.includes(ruleNumber)
  const numberValid = /^[1-9][0-9]*$/.test(ruleNumber) && !numberTaken
  const canSubmit = numberValid

  function update<K extends keyof LocalRouteFormValues>(key: K, value: LocalRouteFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = localRouteFormToOps(family, ruleNumber, rule, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">
        {isCreate ? 'New rule' : `Edit rule ${rule.number}`}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Rule number
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={ruleNumber}
            onChange={(e) => setRuleNumber(e.target.value.replace(/[^0-9]/g, ''))}
            className={`${inputClass} disabled:opacity-60`}
          />
          {numberTaken && <span className="text-danger-500">Rule {ruleNumber} already exists.</span>}
        </label>
        <label className={labelClass}>
          Protocol
          <input
            {...noExtensionInputProps}
            value={values.protocol}
            onChange={(e) => update('protocol', e.target.value)}
            placeholder="tcp, udp, ospf…"
            className={inputClass}
          />
        </label>
        <FieldLabel
          label="Firewall mark"
          hint="Matches packets already tagged with this numeric mark by a Firewall rule elsewhere - lets a firewall decision feed into routing policy."
        >
          <input
            {...noExtensionInputProps}
            value={values.fwmark}
            onChange={(e) => update('fwmark', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputClass}
          />
        </FieldLabel>
        <label className={labelClass}>
          Source port
          <input
            {...noExtensionInputProps}
            value={values.sourcePort}
            onChange={(e) => update('sourcePort', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Destination port
          <input
            {...noExtensionInputProps}
            value={values.destinationPort}
            onChange={(e) => update('destinationPort', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Inbound interface
          <input
            {...noExtensionInputProps}
            value={values.inboundInterface}
            onChange={(e) => update('inboundInterface', e.target.value)}
            placeholder="eth0"
            className={inputClass}
          />
        </label>
        <FieldLabel label="Table" hint="Sends matching traffic to a specific numbered Linux routing table, instead of the main table - useful for multi-table policy routing setups.">
          <input
            {...noExtensionInputProps}
            value={values.table}
            onChange={(e) => update('table', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="1-200"
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="VRF" hint="Sends matching traffic to a named Virtual Routing and Forwarding instance - an isolated routing table with its own set of interfaces.">
          <input
            {...noExtensionInputProps}
            value={values.vrf}
            onChange={(e) => update('vrf', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {isCreate ? 'Queue rule creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
