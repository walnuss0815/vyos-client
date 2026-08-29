import { useState } from 'react'
import {
  blankRuleFormValues,
  ruleFormToOps,
  ruleToFormValues,
  type NATMatchFormValues,
  type NATRuleFormValues,
} from '../../lib/natRuleForm'
import type { NATRule, NATRuleKind } from '../../lib/natTypes'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

// Wider than the shared formStyles.inputClass, matching
// firewall/RuleForm.tsx's own local override for the same reason (fit
// this form's specific layout) - not a candidate for consolidation
// without a visual pass across both.
const inputClass =
  'w-full rounded border border-surface-border bg-surface-800 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-accent-500'
const labelClass = 'flex flex-col gap-1 text-xs text-slate-400'

interface NATRuleFormProps {
  kind: NATRuleKind
  /** undefined = creating a new rule. */
  rule?: NATRule
  existingNumbers: string[]
  onDone: () => void
}

type Tab = 'basic' | 'match' | 'translation'

/** Shared create/edit form for source and destination NAT rules -
 * mirrors firewall/RuleForm.tsx's tabbed structure and, for the
 * match fields, its exact source/destination address/port/group
 * shape (NAT44 rules reuse the same matching vocabulary as Firewall
 * rules - see natTypes.ts's doc comment). */
export default function NATRuleForm({ kind, rule, existingNumbers, onDone }: NATRuleFormProps) {
  const [tab, setTab] = useState<Tab>('basic')
  const [ruleNumber, setRuleNumber] = useState(rule?.number ?? suggestNextNumber(existingNumbers))
  const [values, setValues] = useState<NATRuleFormValues>(
    rule ? ruleToFormValues(rule) : blankRuleFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = rule === undefined
  const numberTaken = isCreate && existingNumbers.includes(ruleNumber)
  const numberValid = /^[1-9][0-9]*$/.test(ruleNumber) && !numberTaken
  const canSubmit = numberValid

  function update<K extends keyof NATRuleFormValues>(key: K, value: NATRuleFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function updateMatch(side: 'source' | 'destination', key: keyof NATMatchFormValues, value: string) {
    setValues((v) => ({ ...v, [side]: { ...v[side], [key]: value } }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = ruleFormToOps(kind, ruleNumber, rule, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  const interfaceLabel = kind === 'source' ? 'Outbound interface' : 'Inbound interface'

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">
          {isCreate ? 'New rule' : `Edit rule ${rule.number}`}
        </h3>
        <div className="flex gap-1 rounded-lg border border-surface-border bg-surface-800 p-0.5 text-xs">
          {(['basic', 'match', 'translation'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 font-medium capitalize ${
                tab === t ? 'bg-accent-600 text-white' : 'text-slate-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'basic' && (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Rule number
            <input
              {...noExtensionInputProps}
              disabled={!isCreate}
              value={ruleNumber}
              onChange={(e) => setRuleNumber(e.target.value.replace(/[^0-9]/g, ''))}
              className={`${inputClass} disabled:opacity-60`}
            />
            {numberTaken && <span className="text-danger-500">Rule {ruleNumber} already exists.</span>}
          </label>
          <FieldLabel
            label={interfaceLabel}
            hint={
              kind === 'source'
                ? 'Source NAT rewrites traffic as it leaves this interface - so it matches on where the packet is going out, not coming in.'
                : 'Destination NAT rewrites traffic as it arrives on this interface - so it matches on where the packet came in, not where it exits.'
            }
          >
            <input
              {...noExtensionInputProps}
              value={values.interfaceName}
              onChange={(e) => update('interfaceName', e.target.value)}
              placeholder="eth0"
              className={inputClass}
            />
          </FieldLabel>
          <label className={labelClass}>
            Protocol
            <input
              {...noExtensionInputProps}
              value={values.protocol}
              onChange={(e) => update('protocol', e.target.value)}
              placeholder="tcp, udp, tcp_udp, all…"
              className={inputClass}
            />
          </label>
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
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.exclude}
              onChange={(e) => update('exclude', e.target.checked)}
              className="accent-accent-500"
            />
            Exclude from NAT
            <InfoTooltip text="Carves out an exception: matching traffic skips NAT entirely (no translation applied), even if a broader rule elsewhere would otherwise catch it." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.disabled}
              onChange={(e) => update('disabled', e.target.checked)}
              className="accent-accent-500"
            />
            Disable this rule
          </label>
        </div>
      )}

      {tab === 'match' && (
        <div className="grid grid-cols-2 gap-4">
          <MatchFields title="Source" values={values.source} onChange={(key, v) => updateMatch('source', key, v)} />
          <MatchFields
            title="Destination"
            values={values.destination}
            onChange={(key, v) => updateMatch('destination', key, v)}
          />
        </div>
      )}

      {tab === 'translation' && (
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel
            label={kind === 'source' ? "Translation address (or 'masquerade')" : 'Translation address'}
            hint={
              kind === 'source'
                ? "The address matching traffic is rewritten to. 'masquerade' dynamically uses whatever address the outbound interface currently has (e.g. a DHCP-assigned WAN IP) instead of a fixed one."
                : 'The internal address matching traffic gets forwarded to.'
            }
          >
            <input
              {...noExtensionInputProps}
              value={values.translationAddress}
              onChange={(e) => update('translationAddress', e.target.value)}
              placeholder={kind === 'source' ? 'masquerade' : '192.168.0.100'}
              className={inputClass}
            />
          </FieldLabel>
          <label className={labelClass}>
            Translation port
            <input
              {...noExtensionInputProps}
              value={values.translationPort}
              onChange={(e) => update('translationPort', e.target.value)}
              className={inputClass}
            />
          </label>
          {kind === 'destination' && (
            <FieldLabel
              label="Redirect to local host, port"
              hint="A distinct NAT target from Translation address above: sends matching traffic to a port on the router itself, rather than forwarding it to a different internal address."
            >
              <input
                {...noExtensionInputProps}
                value={values.redirectPort}
                onChange={(e) => update('redirectPort', e.target.value)}
                placeholder="e.g. 22 (leave blank unless redirecting to the router itself)"
                className={inputClass}
              />
            </FieldLabel>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          {isCreate ? 'Queue new rule' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
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
  values: NATMatchFormValues
  onChange: (key: keyof NATMatchFormValues, value: string) => void
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="space-y-2">
        <label className={labelClass}>
          Address
          <input
            {...noExtensionInputProps}
            value={values.address}
            onChange={(e) => onChange('address', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Port
          <input
            {...noExtensionInputProps}
            value={values.port}
            onChange={(e) => onChange('port', e.target.value)}
            className={inputClass}
          />
        </label>
        <FieldLabel
          label="Address group"
          hint="References a named group of individual addresses/ranges defined on Firewall's Groups tab, rather than typing addresses here directly."
        >
          <input
            {...noExtensionInputProps}
            value={values.addressGroup}
            onChange={(e) => onChange('addressGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel
          label="Network group"
          hint="References a named group of whole CIDR subnets defined on Firewall's Groups tab, rather than individual addresses/ranges."
        >
          <input
            {...noExtensionInputProps}
            value={values.networkGroup}
            onChange={(e) => onChange('networkGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Port group" hint="References a named group of ports/port-ranges defined on Firewall's Groups tab.">
          <input
            {...noExtensionInputProps}
            value={values.portGroup}
            onChange={(e) => onChange('portGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
      </div>
    </div>
  )
}

/** Suggests the next rule number rounded up to a multiple of 10 - same
 * reduce-based (not Math.max(...spread), which risks hitting engine
 * argument-count limits on a very large ruleset) approach as
 * firewall/RuleForm.tsx's suggestNextNumber. */
function suggestNextNumber(existingNumbers: string[]): string {
  if (existingNumbers.length === 0) return '10'
  const max = existingNumbers.reduce((acc, n) => Math.max(acc, Number(n)), 0)
  return String(Math.ceil((max + 1) / 10) * 10)
}
