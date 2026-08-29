import { useState } from 'react'
import {
  blankStaticFormValues,
  staticFormToOps,
  staticToFormValues,
  type NATStaticFormValues,
} from '../../lib/natStaticForm'
import type { NATStaticRule } from '../../lib/natTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'

interface NATStaticRuleFormProps {
  /** undefined = creating a new rule. */
  rule?: NATStaticRule
  existingNumbers: string[]
  onDone: () => void
}

/** Create/edit form for a static (1-to-1) NAT rule - a single
 * destination address maps to a single translation address, no
 * port/protocol/group matching (a materially simpler feature than
 * source/destination rules - see natTypes.ts's doc comment), so this
 * gets one flat form instead of NATRuleForm's tabbed layout. */
export default function NATStaticRuleForm({ rule, existingNumbers, onDone }: NATStaticRuleFormProps) {
  const [ruleNumber, setRuleNumber] = useState(rule?.number ?? '')
  const [values, setValues] = useState<NATStaticFormValues>(
    rule ? staticToFormValues(rule) : blankStaticFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = rule === undefined
  const numberTaken = isCreate && existingNumbers.includes(ruleNumber)
  const numberValid = /^[1-9][0-9]*$/.test(ruleNumber) && !numberTaken
  const canSubmit = numberValid && values.destinationAddress.trim() !== '' && values.translationAddress.trim() !== ''

  function update<K extends keyof NATStaticFormValues>(key: K, value: NATStaticFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = staticFormToOps(ruleNumber, rule, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">
        {isCreate ? 'New static rule' : `Edit static rule ${rule.number}`}
      </h3>
      <div className="grid grid-cols-2 gap-3">
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
          Inbound interface
          <input
            {...noExtensionInputProps}
            value={values.interfaceName}
            onChange={(e) => update('interfaceName', e.target.value)}
            placeholder="eth1"
            className={inputClass}
          />
        </label>
        <FieldLabel
          label="Destination address *"
          hint="The external/public address clients connect to. Static (1-to-1) NAT binds this bidirectionally to Translation address, unlike ordinary source/destination NAT rules which only translate one direction."
        >
          <input
            {...noExtensionInputProps}
            value={values.destinationAddress}
            onChange={(e) => update('destinationAddress', e.target.value)}
            placeholder="192.0.2.30"
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Translation address *" hint="The internal address this external address is bound to, in both directions.">
          <input
            {...noExtensionInputProps}
            value={values.translationAddress}
            onChange={(e) => update('translationAddress', e.target.value)}
            placeholder="192.168.1.10"
            className={inputClass}
          />
        </FieldLabel>
        <label className={`${labelClass} col-span-2`}>
          Description
          <input
            {...noExtensionInputProps}
            value={values.description}
            onChange={(e) => update('description', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.log}
            onChange={(e) => update('log', e.target.checked)}
            className="accent-accent-500"
          />
          Log matches
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue rule creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
