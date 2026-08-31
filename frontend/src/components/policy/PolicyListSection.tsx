import { useState } from 'react'
import {
  blankPolicyListFormValues,
  blankPolicyListRuleFormValues,
  deletePolicyListOp,
  deletePolicyListRuleOp,
  policyListFormToOps,
  policyListRuleFormToOps,
  type PolicyListRuleFormValues,
} from '../../lib/policyListForm'
import type { PolicyList, PolicyListKind } from '../../lib/policyTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

const REGEX_PLACEHOLDER: Record<PolicyListKind, string> = {
  'as-path': '^64512',
  community: 'no-export, 64512:100',
  extcommunity: 'rt 64512:100',
  'large-community': '64512:1:1',
}

const REGEX_HINT: Record<PolicyListKind, string> = {
  'as-path': "A regular expression matched against a route's BGP AS-path (the sequence of autonomous systems it traversed) - e.g. ^64512 matches paths starting with AS 64512.",
  community: "A space-separated set of BGP community values to match, or a well-known name like no-export/no-advertise - matches routes carrying any/all of these.",
  extcommunity: "A BGP extended-community value to match, e.g. a route-target ('rt ...') or site-of-origin - a richer, typed successor to plain communities.",
  'large-community': 'A BGP large-community value (three colon-separated 32-bit numbers) to match - designed for 4-byte AS numbers that plain communities cannot represent.',
}

/** Shared list of as-path/community/extcommunity/large-community
 * lists - all four are the exact same shape in VyOS itself (name/
 * description, rules with action/description/regex), so one
 * component handles all four, parametrized by `kind` - see
 * policyTypes.ts's doc comment. */
export default function PolicyListSection({ kind, lists }: { kind: PolicyListKind; lists: PolicyList[] }) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [firstRuleRegex, setFirstRuleRegex] = useState('')
  const [firstRuleAction, setFirstRuleAction] = useState<'' | 'permit' | 'deny'>('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = lists.some((l) => l.name === trimmedName)
  const valid = trimmedName !== '' && !taken && description.trim() !== ''

  function submitCreate() {
    if (!valid) return
    const values = blankPolicyListFormValues()
    values.description = description
    const ops = policyListFormToOps(kind, trimmedName, undefined, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    // A list's rules used to only be configurable AFTER the list
    // already existed - RulesSection only ever operates on an
    // already-fetched list. Queuing a first one here, in the same
    // commit as the list itself, avoids a detour through
    // commit+refetch.
    if (firstRuleRegex.trim()) {
      const ruleOps = policyListRuleFormToOps(kind, trimmedName, '10', undefined, {
        ...blankPolicyListRuleFormValues(),
        action: firstRuleAction,
        regex: firstRuleRegex.trim(),
      })
      for (const op of ruleOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setName('')
    setDescription('')
    setFirstRuleRegex('')
    setFirstRuleAction('')
    setShowCreate(false)
  }

  function queueDelete(listName: string) {
    const op = deletePolicyListOp(kind, listName)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Named lists of rules, referenced by route-maps to match on their respective attribute.
        </p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
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
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">First rule #10 (optional)</p>
            <div className="grid grid-cols-3 gap-3">
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
              <label className={`col-span-2 ${labelClass}`}>
                Regex
                <input
                  {...noExtensionInputProps}
                  value={firstRuleRegex}
                  onChange={(e) => setFirstRuleRegex(e.target.value)}
                  placeholder={REGEX_PLACEHOLDER[kind]}
                  className={inputClass}
                />
              </label>
            </div>
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
            <RulesSection kind={kind} list={list} />
          </div>
        ))}
        {lists.length === 0 && <p className="text-xs text-slate-500">No lists configured yet.</p>}
      </div>
    </div>
  )
}

function RulesSection({ kind, list }: { kind: PolicyListKind; list: PolicyList }) {
  const [showAdd, setShowAdd] = useState(false)
  const [ruleNumber, setRuleNumber] = useState('')
  const [values, setValues] = useState<PolicyListRuleFormValues>(blankPolicyListRuleFormValues())
  const add = usePendingChangesStore((s) => s.add)

  const existingNumbers = list.rules.map((r) => r.number)
  const numberTaken = existingNumbers.includes(ruleNumber)
  const numberValid = /^[1-9][0-9]*$/.test(ruleNumber) && !numberTaken
  const valid = numberValid && values.regex.trim() !== ''

  function update<K extends keyof PolicyListRuleFormValues>(key: K, value: PolicyListRuleFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!valid) return
    const ops = policyListRuleFormToOps(kind, list.name, ruleNumber, undefined, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setRuleNumber('')
    setValues(blankPolicyListRuleFormValues())
    setShowAdd(false)
  }

  function queueRemove(ruleNum: string) {
    const op = deletePolicyListRuleOp(kind, list.name, ruleNum)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs text-slate-500">
          Rules
          <InfoTooltip text={REGEX_HINT[kind]} />
        </p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add rule'}
        </button>
      </div>

      {showAdd && (
        <div className="my-2 grid grid-cols-2 gap-2 rounded border border-surface-border p-2 sm:grid-cols-4">
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
            onChange={(e) => update('action', e.target.value as PolicyListRuleFormValues['action'])}
            className={inputClass}
          >
            <option value="">action</option>
            <option value="permit">permit</option>
            <option value="deny">deny</option>
          </select>
          <input
            {...noExtensionInputProps}
            value={values.regex}
            onChange={(e) => update('regex', e.target.value)}
            placeholder={REGEX_PLACEHOLDER[kind]}
            className={`col-span-2 ${inputClass}`}
          />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {numberTaken && <p className="col-span-4 text-danger-500">Rule {ruleNumber} already exists.</p>}
        </div>
      )}

      <ul className="space-y-1">
        {list.rules.map((rule) => (
          <li key={rule.number} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              #{rule.number} {rule.action ?? 'permit'} <span className="text-slate-500">{rule.regex}</span>
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
