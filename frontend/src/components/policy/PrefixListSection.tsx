import { useState } from 'react'
import {
  blankPrefixListFormValues,
  blankPrefixListRuleFormValues,
  deletePrefixListOp,
  deletePrefixListRuleOp,
  prefixListFormToOps,
  prefixListRuleFormToOps,
  type PrefixListRuleFormValues,
} from '../../lib/prefixListForm'
import type { PrefixList, PrefixListFamily } from '../../lib/policyTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

export default function PrefixListSection({
  family,
  lists,
}: {
  family: PrefixListFamily
  lists: PrefixList[]
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = lists.some((l) => l.name === trimmedName)
  const valid = trimmedName !== '' && !taken && description.trim() !== ''

  function submitCreate() {
    if (!valid) return
    const values = blankPrefixListFormValues()
    values.description = description
    const ops = prefixListFormToOps(family, trimmedName, undefined, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setName('')
    setDescription('')
    setShowCreate(false)
  }

  function queueDelete(listName: string) {
    const op = deletePrefixListOp(family, listName)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Prefix-based filtering with prefix-length range matching, referenced by route-maps and
          used directly by BGP/OSPF's own redistribution filtering.
        </p>
        <button onClick={() => setShowCreate((v) => !v)} className={`shrink-0 bg-accent-600 ${buttonClass}`}>
          {showCreate ? 'Cancel' : '+ New list'}
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
              {taken && <span className="text-danger-500">This list already exists.</span>}
            </label>
            <label className={labelClass}>
              Description *
              <input
                {...noExtensionInputProps}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <button onClick={submitCreate} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
            Queue list creation
          </button>
        </div>
      )}

      <div className="space-y-3">
        {lists.map((list) => (
          <div key={list.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="font-mono text-sm font-medium text-white">{list.name}</span>
                {list.description && <p className="text-xs text-slate-400">{list.description}</p>}
              </div>
              <button
                onClick={() => queueDelete(list.name)}
                className="text-xs text-slate-500 hover:text-danger-500"
              >
                Delete list
              </button>
            </div>
            <RulesSection family={family} list={list} />
          </div>
        ))}
        {lists.length === 0 && <p className="text-xs text-slate-500">No lists configured yet.</p>}
      </div>
    </div>
  )
}

function RulesSection({ family, list }: { family: PrefixListFamily; list: PrefixList }) {
  const [showAdd, setShowAdd] = useState(false)
  const [ruleNumber, setRuleNumber] = useState('')
  const [values, setValues] = useState<PrefixListRuleFormValues>(blankPrefixListRuleFormValues())
  const add = usePendingChangesStore((s) => s.add)

  const existingNumbers = list.rules.map((r) => r.number)
  const numberTaken = existingNumbers.includes(ruleNumber)
  const numberValid = /^[1-9][0-9]*$/.test(ruleNumber) && !numberTaken
  const valid = numberValid && values.prefix.trim() !== ''

  function update<K extends keyof PrefixListRuleFormValues>(key: K, value: PrefixListRuleFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!valid) return
    const ops = prefixListRuleFormToOps(family, list.name, ruleNumber, undefined, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setRuleNumber('')
    setValues(blankPrefixListRuleFormValues())
    setShowAdd(false)
  }

  function queueRemove(ruleNum: string) {
    const op = deletePrefixListRuleOp(family, list.name, ruleNum)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs text-slate-500">
          Rules
          <InfoTooltip text="ge/le restrict how specific a matching prefix's length can be - e.g. a /16 with ge 24 le 32 matches any prefix from /24 through /32 within that /16, not just the /16 itself." />
        </p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add rule'}
        </button>
      </div>

      {showAdd && (
        <div className="my-2 grid grid-cols-2 gap-2 rounded border border-surface-border p-2 sm:grid-cols-6">
          <input
            {...noExtensionInputProps}
            autoFocus
            value={ruleNumber}
            onChange={(e) => setRuleNumber(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="rule #"
            className={inputClass}
          />
          <select
            value={values.action}
            onChange={(e) => update('action', e.target.value as PrefixListRuleFormValues['action'])}
            className={inputClass}
          >
            <option value="">action</option>
            <option value="permit">permit</option>
            <option value="deny">deny</option>
          </select>
          <input
            {...noExtensionInputProps}
            value={values.prefix}
            onChange={(e) => update('prefix', e.target.value)}
            placeholder={family === 'ipv6' ? '2001:db8::/32' : '192.0.2.0/24'}
            className={`col-span-2 ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={values.ge}
            onChange={(e) => update('ge', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="ge (min length)"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.le}
            onChange={(e) => update('le', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="le (max length)"
            className={inputClass}
          />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {numberTaken && <p className="col-span-6 text-danger-500">Rule {ruleNumber} already exists.</p>}
        </div>
      )}

      <ul className="space-y-1">
        {list.rules.map((rule) => (
          <li key={rule.number} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              #{rule.number} {rule.action ?? 'permit'} <span className="text-slate-500">{rule.prefix}</span>
              {rule.ge && <span className="text-slate-500"> ge {rule.ge}</span>}
              {rule.le && <span className="text-slate-500"> le {rule.le}</span>}
            </span>
            <button onClick={() => queueRemove(rule.number)} className="text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </li>
        ))}
        {list.rules.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
    </div>
  )
}
