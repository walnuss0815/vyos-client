import { useState } from 'react'
import { Link } from 'react-router-dom'
import { rulesetPath } from '../../lib/firewallParse'
import { blankRuleFormValues, ruleFormToOps } from '../../lib/firewallRuleForm'
import type { RuleAction } from '../../lib/firewallTypes'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { useFirewallConfig } from '../../hooks/useFirewallConfig'
import { usePendingChangesStore } from '../../store/pendingChanges'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { isValidVyOSIdentifier } from '../../lib/vyosIdentifier'

export default function RulesetsPage() {
  const { rulesets, isLoading, isError } = useFirewallConfig()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          The three base chains apply to all traffic in that direction; custom chains are used as
          zone-to-zone rulesets or jump targets.
        </p>
        <button onClick={() => setShowCreate((v) => !v)} className={`shrink-0 bg-accent-600 ${buttonClass}`}>
          {showCreate ? 'Cancel' : '+ New custom ruleset'}
        </button>
      </div>

      {showCreate && <CreateRulesetForm onDone={() => setShowCreate(false)} />}

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load firewall configuration.</p>}

      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-900 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Family</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Default action</th>
              <th className="px-4 py-2">Rules</th>
            </tr>
          </thead>
          <tbody>
            {rulesets.map((rs) => (
              <tr
                key={`${rs.family}-${rs.kind}-${rs.id}`}
                className="border-t border-surface-border bg-surface-900/50 hover:bg-surface-800"
              >
                <td className="px-4 py-2">
                  <Link
                    to={`/firewall/rulesets/${rs.family}/${rs.kind}/${encodeURIComponent(rs.id)}`}
                    className="font-mono text-accent-500 hover:text-accent-400"
                  >
                    {rs.id}
                  </Link>
                  {rs.description && <p className="text-xs text-slate-500">{rs.description}</p>}
                </td>
                <td className="px-4 py-2 font-mono text-xs uppercase text-slate-400">{rs.family}</td>
                <td className="px-4 py-2 text-xs text-slate-400">{rs.kind === 'base' ? 'Base chain' : 'Custom chain'}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-300">{rs.defaultAction ?? 'accept'}</td>
                <td className="px-4 py-2 text-xs text-slate-400">{rs.rules.length}</td>
              </tr>
            ))}
            {!isLoading && rulesets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  No rulesets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CreateRulesetForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [family, setFamily] = useState<'ipv4' | 'ipv6'>('ipv4')
  const [description, setDescription] = useState('')
  const [firstRuleAction, setFirstRuleAction] = useState<RuleAction | ''>('')
  const [firstRuleProtocol, setFirstRuleProtocol] = useState('')
  const [firstRuleDescription, setFirstRuleDescription] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const valid = isValidVyOSIdentifier(name)

  function submit() {
    if (!valid) return
    const ref = { id: name, kind: 'custom' as const, family }
    add({
      op: { op: 'set', path: rulesetPath(ref, 'default-action'), value: 'drop' },
      label: `set firewall ${family} name ${name} default-action 'drop'`,
    })
    if (description.trim()) {
      add({
        op: { op: 'set', path: rulesetPath(ref, 'description'), value: description.trim() },
        label: `set firewall ${family} name ${name} description '${description.trim()}'`,
      })
    }
    // A ruleset commits fine with zero rules (falls through to the
    // default action above), so this isn't a VyOS deadlock the way
    // e.g. a DHCP subnet's range is - but RuleForm.tsx (the normal way
    // to add a rule) only ever operates on an already-fetched
    // ruleset, so without this a brand new ruleset would need a
    // round-trip through commit+refetch before its very first rule
    // could be added. Queuing a simple first rule here (VyOS's own
    // "start at 10, increment by 10" numbering convention) avoids
    // that detour - further rules, and refining this one with the
    // full RuleForm's match/interface/logging options, both work the
    // normal way once the ruleset exists.
    if (firstRuleAction) {
      const ruleOps = ruleFormToOps(ref, '10', undefined, {
        ...blankRuleFormValues(),
        action: firstRuleAction,
        protocol: firstRuleProtocol,
        description: firstRuleDescription,
      })
      for (const op of ruleOps) {
        add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
      }
    }
    onDone()
  }

  return (
    <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Name
          <input
            {...noExtensionInputProps}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="WAN-LAN-v4"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Family
          <select
            value={family}
            onChange={(e) => setFamily(e.target.value as 'ipv4' | 'ipv6')}
            className={inputClass}
          >
            <option value="ipv4">IPv4</option>
            <option value="ipv6">IPv6</option>
          </select>
        </label>
        <label className={labelClass}>
          Description (optional)
          <input
            {...noExtensionInputProps}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3 border-t border-surface-border pt-3">
        <p className="mb-2 text-xs text-slate-500">
          First rule (optional) - numbered 10, VyOS's own convention for leaving room to insert
          rules before it later. Add more rules, or refine this one (matching by address/port/
          interface/group, jump targets, logging), from the ruleset's own page once it exists.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            Action
            <select
              value={firstRuleAction}
              onChange={(e) => setFirstRuleAction(e.target.value as RuleAction | '')}
              className={inputClass}
            >
              <option value="">None (skip this rule)</option>
              <option value="accept">accept</option>
              <option value="drop">drop</option>
              <option value="reject">reject</option>
            </select>
          </label>
          <label className={labelClass}>
            Protocol (optional)
            <input
              {...noExtensionInputProps}
              value={firstRuleProtocol}
              onChange={(e) => setFirstRuleProtocol(e.target.value)}
              placeholder="tcp"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Description (optional)
            <input
              {...noExtensionInputProps}
              value={firstRuleDescription}
              onChange={(e) => setFirstRuleDescription(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Queue ruleset creation
      </button>
    </div>
  )
}
