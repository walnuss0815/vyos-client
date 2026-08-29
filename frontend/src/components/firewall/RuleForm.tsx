import { useState } from 'react'
import {
  blankRuleFormValues,
  ruleFormToOps,
  ruleToFormValues,
  type MatchFormValues,
  type RuleFormValues,
} from '../../lib/firewallRuleForm'
import type { RulesetRef } from '../../lib/firewallParse'
import type { FirewallRule, RuleAction } from '../../lib/firewallTypes'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import { labelClass } from '../../lib/formStyles'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

const RULE_ACTIONS: readonly RuleAction[] = [
  'accept',
  'drop',
  'reject',
  'continue',
  'jump',
  'queue',
  'return',
  'synproxy',
]

// Wider than the shared formStyles.inputClass (w-full, taller padding)
// to fit RuleForm's specific layout - not a candidate for
// consolidation with the shared one without a visual pass.
const inputClass =
  'w-full rounded border border-surface-border bg-surface-800 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-accent-500'

interface RuleFormProps {
  rulesetRef: RulesetRef
  /** undefined = creating a new rule. */
  rule?: FirewallRule
  existingNumbers: string[]
  onDone: () => void
}

type Tab = 'basic' | 'match' | 'advanced'

export default function RuleForm({ rulesetRef, rule, existingNumbers, onDone }: RuleFormProps) {
  const [tab, setTab] = useState<Tab>('basic')
  const [ruleNumber, setRuleNumber] = useState(rule?.number ?? suggestNextNumber(existingNumbers))
  const [values, setValues] = useState<RuleFormValues>(rule ? ruleToFormValues(rule) : blankRuleFormValues())
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = rule === undefined
  const numberTaken = isCreate && existingNumbers.includes(ruleNumber)
  const numberValid = /^[1-9][0-9]*$/.test(ruleNumber) && !numberTaken
  const canSubmit = numberValid && values.action !== ''

  function update<K extends keyof RuleFormValues>(key: K, value: RuleFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function updateMatch(side: 'source' | 'destination', key: keyof MatchFormValues, value: string) {
    setValues((v) => ({ ...v, [side]: { ...v[side], [key]: value } }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = ruleFormToOps(rulesetRef, ruleNumber, rule, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">
          {isCreate ? 'New rule' : `Edit rule ${rule.number}`}
        </h3>
        <div className="flex gap-1 rounded-lg border border-surface-border bg-surface-800 p-0.5 text-xs">
          {(['basic', 'match', 'advanced'] as Tab[]).map((t) => (
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
            label="Action *"
            hint="accept/drop/reject are the common outcomes. continue keeps evaluating later rules; jump hands off to a separate custom chain; return exits back to the caller (only meaningful inside a custom chain); queue passes the packet to userspace; synproxy defends against SYN-flood connection attempts."
          >
            <select value={values.action} onChange={(e) => update('action', e.target.value as RuleAction)} className={inputClass}>
              <option value="">Select an action…</option>
              {RULE_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </FieldLabel>
          {values.action === 'jump' && (
            <FieldLabel
              label="Jump target (custom chain name)"
              hint="The name of a custom firewall chain to hand this packet off to for further, separate rule evaluation."
            >
              <input
                {...noExtensionInputProps}
                value={values.jumpTarget}
                onChange={(e) => update('jumpTarget', e.target.value)}
                className={inputClass}
              />
            </FieldLabel>
          )}
          <label className={labelClass}>
            Protocol
            <input
              {...noExtensionInputProps}
              value={values.protocol}
              onChange={(e) => update('protocol', e.target.value)}
              placeholder={rulesetRef.family === 'ipv6' ? 'tcp, udp, icmpv6, all…' : 'tcp, udp, icmp, all…'}
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
            <InfoTooltip text="Writes a syslog entry every time a packet matches this rule - useful for troubleshooting, but noisy on high-traffic rules." />
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
          <MatchFields
            title="Source"
            values={values.source}
            onChange={(key, v) => updateMatch('source', key, v)}
            showMacAddress
          />
          <MatchFields
            title="Destination"
            values={values.destination}
            onChange={(key, v) => updateMatch('destination', key, v)}
            showMacAddress={false}
          />
        </div>
      )}

      {tab === 'advanced' && (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Inbound interface
            <input
              {...noExtensionInputProps}
              value={values.inboundInterface}
              onChange={(e) => update('inboundInterface', e.target.value)}
              placeholder="eth1 (wildcards like eth3* allowed)"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Outbound interface
            <input
              {...noExtensionInputProps}
              value={values.outboundInterface}
              onChange={(e) => update('outboundInterface', e.target.value)}
              className={inputClass}
            />
          </label>
          <FieldLabel
            label={rulesetRef.family === 'ipv6' ? 'ICMPv6 type name' : 'ICMP type name'}
            hint="A named ICMP message type (e.g. echo-request, time-exceeded) rather than a raw numeric type/code pair - only takes effect when protocol above is set to icmp/icmpv6."
          >
            <input
              {...noExtensionInputProps}
              value={values.icmpTypeName}
              onChange={(e) => update('icmpTypeName', e.target.value)}
              placeholder={
                rulesetRef.family === 'ipv6'
                  ? 'echo-request (only relevant when protocol = icmpv6)'
                  : 'echo-request (only relevant when protocol = icmp)'
              }
              className={inputClass}
            />
          </FieldLabel>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          {isCreate ? 'Queue new rule' : 'Queue changes'}
        </button>
        <button onClick={onDone} className="rounded border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:bg-surface-800">
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
  showMacAddress,
}: {
  title: string
  values: MatchFormValues
  onChange: (key: keyof MatchFormValues, value: string) => void
  showMacAddress: boolean
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-2">
        <label className={labelClass}>
          Address
          <input
            {...noExtensionInputProps}
            value={values.address}
            onChange={(e) => onChange('address', e.target.value)}
            placeholder="10.0.0.0/24, a range, or !negated"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Port
          <input
            {...noExtensionInputProps}
            value={values.port}
            onChange={(e) => onChange('port', e.target.value)}
            placeholder="443, http, or 5000-5010"
            className={inputClass}
          />
        </label>
        {showMacAddress && (
          <label className={labelClass}>
            MAC address
            <input
              {...noExtensionInputProps}
              value={values.macAddress}
              onChange={(e) => onChange('macAddress', e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        {showMacAddress && (
          <FieldLabel label="MAC group" hint="References a named group of hardware addresses defined on the Groups tab, instead of typing one directly above.">
            <input
              {...noExtensionInputProps}
              value={values.macGroup}
              onChange={(e) => onChange('macGroup', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
        )}
        <FieldLabel
          label="Address group"
          hint="References a named group of individual addresses/ranges defined on the Groups tab, rather than typing addresses here directly."
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
          hint="References a named group of whole CIDR subnets defined on the Groups tab, rather than individual addresses/ranges."
        >
          <input
            {...noExtensionInputProps}
            value={values.networkGroup}
            onChange={(e) => onChange('networkGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Port group" hint="References a named group of ports/port-ranges defined on the Groups tab.">
          <input
            {...noExtensionInputProps}
            value={values.portGroup}
            onChange={(e) => onChange('portGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Domain group" hint="References a named group of domain names defined on the Groups tab - matches traffic resolved to those domains.">
          <input
            {...noExtensionInputProps}
            value={values.domainGroup}
            onChange={(e) => onChange('domainGroup', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
      </div>
    </div>
  )
}

function suggestNextNumber(existing: string[]): string {
  if (existing.length === 0) return '10'
  // A reduce-based max avoids Math.max(...spread)'s risk of hitting JS
  // engine argument-count limits for a pathologically large ruleset
  // (VyOS technically allows rule numbers up to 999999).
  const max = existing
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0)
  // The next multiple of 10 strictly greater than max, e.g. 25 -> 30,
  // 10 -> 20, 30 -> 40 (not 25 -> 40, which a naive "+10 then round"
  // would produce).
  return String(Math.ceil((max + 1) / 10) * 10)
}
