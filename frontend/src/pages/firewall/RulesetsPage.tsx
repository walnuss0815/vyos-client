import { useState } from 'react'
import { Link } from 'react-router-dom'
import { rulesetPath } from '../../lib/firewallParse'
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
      <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Queue ruleset creation
      </button>
    </div>
  )
}
