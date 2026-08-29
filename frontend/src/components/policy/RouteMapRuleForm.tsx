import { useState } from 'react'
import {
  blankRouteMapRuleFormValues,
  routeMapRuleFormToOps,
  routeMapRuleToFormValues,
  type RouteMapMatchFormValues,
  type RouteMapRuleFormValues,
  type RouteMapSetFormValues,
} from '../../lib/routeMapForm'
import type { RouteMapRule } from '../../lib/policyTypes'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

const inputClass =
  'w-full rounded border border-surface-border bg-surface-800 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-accent-500'
const labelClass = 'flex flex-col gap-1 text-xs text-slate-400'

interface RouteMapRuleFormProps {
  mapName: string
  /** undefined = creating a new rule. */
  rule?: RouteMapRule
  existingNumbers: string[]
  onDone: () => void
}

type Tab = 'basic' | 'match' | 'set'

/** Create/edit form for a single route-map rule - a curated core of
 * VyOS's 60+ match/set commands, tabbed like firewall/RuleForm.tsx and
 * nat/NATRuleForm.tsx. See policyTypes.ts's doc comment for exactly
 * what's covered and what's deliberately left Config-Tree-only. */
export default function RouteMapRuleForm({ mapName, rule, existingNumbers, onDone }: RouteMapRuleFormProps) {
  const [tab, setTab] = useState<Tab>('basic')
  const [ruleNumber, setRuleNumber] = useState(rule?.number ?? suggestNextNumber(existingNumbers))
  const [values, setValues] = useState<RouteMapRuleFormValues>(
    rule ? routeMapRuleToFormValues(rule) : blankRouteMapRuleFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = rule === undefined
  const numberTaken = isCreate && existingNumbers.includes(ruleNumber)
  const numberValid = /^[1-9][0-9]*$/.test(ruleNumber) && !numberTaken
  const canSubmit = numberValid

  function update<K extends keyof RouteMapRuleFormValues>(key: K, value: RouteMapRuleFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function updateMatch<K extends keyof RouteMapMatchFormValues>(key: K, value: RouteMapMatchFormValues[K]) {
    setValues((v) => ({ ...v, match: { ...v.match, [key]: value } }))
  }

  function updateSet<K extends keyof RouteMapSetFormValues>(key: K, value: RouteMapSetFormValues[K]) {
    setValues((v) => ({ ...v, set: { ...v.set, [key]: value } }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = routeMapRuleFormToOps(mapName, ruleNumber, rule, values)
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
          {(['basic', 'match', 'set'] as Tab[]).map((t) => (
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
            label="Action"
            hint="permit lets a matching route through with any changes below applied; deny drops it. A route that matches no rule at all is implicitly denied."
          >
            <select value={values.action} onChange={(e) => update('action', e.target.value as RouteMapRuleFormValues['action'])} className={inputClass}>
              <option value="">(default: permit)</option>
              <option value="permit">permit</option>
              <option value="deny">deny</option>
            </select>
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
          <FieldLabel
            label="Call route-map"
            hint="Nests another route-map's rules inside this one as a subroutine - if the called map permits, evaluation continues here; if it denies, this rule denies too."
          >
            <input
              {...noExtensionInputProps}
              value={values.call}
              onChange={(e) => update('call', e.target.value)}
              placeholder="another route-map name"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="On match, goto rule"
            hint="Jumps straight to a specific rule number in this map instead of continuing sequentially to the next one - skips whatever's in between."
          >
            <input
              {...noExtensionInputProps}
              value={values.onMatchGoto}
              onChange={(e) => update('onMatchGoto', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputClass}
            />
          </FieldLabel>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.onMatchNext}
              onChange={(e) => update('onMatchNext', e.target.checked)}
              className="accent-accent-500"
            />
            On match, continue to next rule
            <InfoTooltip text="By default a rule that matches stops evaluation there. This keeps applying subsequent rules' set actions too, instead of stopping at the first match." />
          </label>
        </div>
      )}

      {tab === 'match' && (
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel
            label="AS-path list"
            hint="References a named as-path access-list (from Policy's Lists tab) that matches on a BGP route's autonomous-system path."
          >
            <input
              {...noExtensionInputProps}
              value={values.match.asPath}
              onChange={(e) => updateMatch('asPath', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <label className={labelClass}>
            Protocol
            <input
              {...noExtensionInputProps}
              value={values.match.protocol}
              onChange={(e) => updateMatch('protocol', e.target.value)}
              placeholder="bgp, ospf, connected, static…"
              className={inputClass}
            />
          </label>
          <FieldLabel
            label="Community list"
            hint="References a named BGP community list (from Policy's Lists tab) that matches on the route's community attribute values."
          >
            <input
              {...noExtensionInputProps}
              value={values.match.communityList}
              onChange={(e) => updateMatch('communityList', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.match.communityExactMatch}
              onChange={(e) => updateMatch('communityExactMatch', e.target.checked)}
              className="accent-accent-500"
            />
            Exact community match
            <InfoTooltip text="Requires the route's community set to contain only the referenced list's values and nothing else, rather than just including them among others." />
          </label>
          <FieldLabel label="IPv4 prefix list" hint="References a named IPv4 prefix list (from Policy's Prefix Lists tab) - matches routes whose destination falls within it.">
            <input
              {...noExtensionInputProps}
              value={values.match.ipPrefixList}
              onChange={(e) => updateMatch('ipPrefixList', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="IPv6 prefix list" hint="Same as the IPv4 prefix list field, for IPv6 routes.">
            <input
              {...noExtensionInputProps}
              value={values.match.ipv6PrefixList}
              onChange={(e) => updateMatch('ipv6PrefixList', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Metric" hint="Matches routes whose own metric (e.g. an OSPF cost or a redistributed protocol's metric) equals this value.">
            <input
              {...noExtensionInputProps}
              value={values.match.metric}
              onChange={(e) => updateMatch('metric', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="Local preference"
            hint="A BGP-only path-selection attribute exchanged between routers within the same autonomous system - higher values are preferred over lower ones."
          >
            <input
              {...noExtensionInputProps}
              value={values.match.localPreference}
              onChange={(e) => updateMatch('localPreference', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Tag" hint="An opaque numeric marker some routing protocols carry on redistributed routes, often used to avoid redistribution loops.">
            <input
              {...noExtensionInputProps}
              value={values.match.tag}
              onChange={(e) => updateMatch('tag', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputClass}
            />
          </FieldLabel>
        </div>
      )}

      {tab === 'set' && (
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel
            label="Metric"
            hint="A literal value replaces the route's metric outright; +N/-N adjusts it relative to the current value; rtt sets it based on measured round-trip time to the next hop."
          >
            <input
              {...noExtensionInputProps}
              value={values.set.metric}
              onChange={(e) => updateSet('metric', e.target.value)}
              placeholder="100, +10, -10, rtt…"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="Local preference"
            hint="Sets the BGP-only path-selection attribute exchanged within this autonomous system - higher values make this route more preferred over alternatives."
          >
            <input
              {...noExtensionInputProps}
              value={values.set.localPreference}
              onChange={(e) => updateSet('localPreference', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="AS-path prepend"
            hint="Artificially lengthens the route's AS-path by repeating the given AS number(s) - a common BGP traffic-engineering trick to make a path look less attractive to peers."
          >
            <input
              {...noExtensionInputProps}
              value={values.set.asPathPrepend}
              onChange={(e) => updateSet('asPathPrepend', e.target.value)}
              placeholder="64512 64512"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="AS-path exclude" hint="Removes the given AS number(s) from the route's AS-path before advertising it (or 'all' to strip the entire path).">
            <input
              {...noExtensionInputProps}
              value={values.set.asPathExclude}
              onChange={(e) => updateSet('asPathExclude', e.target.value)}
              placeholder="64512, or all"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="Add community"
            hint="Attaches one or more BGP community values to the route, in addition to any it already carries. 'no-export' is a well-known value meaning don't advertise this route beyond the local AS."
          >
            <input
              {...noExtensionInputProps}
              value={values.set.communityAdd}
              onChange={(e) => updateSet('communityAdd', e.target.value)}
              placeholder="no-export"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Replace community" hint="Overwrites the route's entire community set with the value(s) given here, rather than adding to what's already there.">
            <input
              {...noExtensionInputProps}
              value={values.set.communityReplace}
              onChange={(e) => updateSet('communityReplace', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Delete community (list name)" hint="Removes any community values matching the referenced named list from the route, leaving the rest untouched.">
            <input
              {...noExtensionInputProps}
              value={values.set.communityDelete}
              onChange={(e) => updateSet('communityDelete', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.set.communityNone}
              onChange={(e) => updateSet('communityNone', e.target.checked)}
              className="accent-accent-500"
            />
            Clear all communities
            <InfoTooltip text="Strips every community value from the route entirely, regardless of what it arrived with." />
          </label>
          <FieldLabel
            label="Origin"
            hint="A BGP-internal code describing how the route entered BGP: igp (originated inside this AS via an interior protocol), egp (learned via the legacy Exterior Gateway Protocol, rarely seen today), or incomplete (e.g. redistributed from a static route, origin unknown)."
          >
            <select
              value={values.set.origin}
              onChange={(e) => updateSet('origin', e.target.value as RouteMapSetFormValues['origin'])}
              className={inputClass}
            >
              <option value="">(unset)</option>
              <option value="igp">igp</option>
              <option value="egp">egp</option>
              <option value="incomplete">incomplete</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Tag" hint="Sets the opaque numeric marker some routing protocols carry on redistributed routes, often used to avoid redistribution loops.">
            <input
              {...noExtensionInputProps}
              value={values.set.tag}
              onChange={(e) => updateSet('tag', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="Weight"
            hint="A BGP path-selection tie-breaker that's significant only on this router (never advertised to peers) - it's checked before any other attribute, including the AS-wide preference attribute above."
          >
            <input
              {...noExtensionInputProps}
              value={values.set.weight}
              onChange={(e) => updateSet('weight', e.target.value.replace(/[^0-9]/g, ''))}
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
          {isCreate ? 'Queue new rule' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Same reduce-based (not Math.max(...spread)) approach as
 * firewall/RuleForm.tsx's suggestNextNumber. */
function suggestNextNumber(existingNumbers: string[]): string {
  if (existingNumbers.length === 0) return '10'
  const max = existingNumbers.reduce((acc, n) => Math.max(acc, Number(n)), 0)
  return String(Math.ceil((max + 1) / 10) * 10)
}
