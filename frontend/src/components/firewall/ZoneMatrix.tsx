import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { zonePath } from '../../lib/firewallParse'
import type { FirewallRuleset, FirewallZone } from '../../lib/firewallTypes'
import { usePendingChangesStore } from '../../store/pendingChanges'
import { buttonClass, inputClass } from '../../lib/formStyles'
import InfoTooltip from '../InfoTooltip'

/**
 * A from/to grid view of every zone pair, as an alternative to
 * ZonesPage's per-zone card list (which shows the same underlying
 * `zone.from` data, just one zone at a time - functionally equivalent,
 * less visual for spotting gaps or unexpected zone-to-zone access at a
 * glance across a router with many zones).
 *
 * Rows are "from" (source) zones, columns are "to" (destination)
 * zones, matching VyOS's own `zone <TO> from <FROM> firewall name
 * <ruleset>` config-tree shape - a cell is that TO zone's `from[FROM]`
 * ruleset name, if set.
 */
export default function ZoneMatrix({
  zones,
  rulesets,
}: {
  zones: FirewallZone[]
  rulesets: FirewallRuleset[]
}) {
  const add = usePendingChangesStore((s) => s.add)
  const [editingCell, setEditingCell] = useState<{ from: string; to: string } | null>(null)

  // Not just zones.map(z => z.name): a from-entry can in principle
  // name a zone that isn't (or is no longer) itself a top-level `zone
  // <name>` entry - included here too so the matrix never silently
  // hides a configured zone-to-zone rule just because its source zone
  // lacks its own entry.
  const zoneNames = useMemo(() => {
    const names = new Set<string>()
    for (const zone of zones) {
      names.add(zone.name)
      for (const fromZone of Object.keys(zone.from)) names.add(fromZone)
    }
    return Array.from(names).sort()
  }, [zones])

  const zoneByName = useMemo(() => new Map(zones.map((z) => [z.name, z])), [zones])

  // A zone's `from ... firewall name <ruleset>` entry is itself
  // family-agnostic - VyOS looks up whichever of `firewall ipv4 name
  // <ruleset>`/`firewall ipv6 name <ruleset>` exist and applies the
  // version-appropriate one to matching traffic (the usual convention
  // is to give both an identical name so one zone assignment covers
  // both families). If both exist under the same name, this can only
  // link to one of them (ipv4 first, by parseRulesets' loop order) -
  // a narrow, documented limitation rather than showing two links for
  // what's overwhelmingly a single logical ruleset pair in practice.
  function rulesetLink(rulesetName: string): { kind: 'base' | 'custom'; family: 'ipv4' | 'ipv6' } {
    const match = rulesets.find((rs) => rs.id === rulesetName)
    return { kind: match?.kind ?? 'custom', family: match?.family ?? 'ipv4' }
  }

  function queueSet(toZone: string, fromZone: string, rulesetName: string) {
    add({
      op: {
        op: 'set',
        path: zonePath(toZone, 'from', fromZone, 'firewall', 'name'),
        value: rulesetName,
      },
      label: `set zone ${toZone} from ${fromZone} firewall name '${rulesetName}'`,
    })
    setEditingCell(null)
  }

  function queueRemove(toZone: string, fromZone: string) {
    add({
      op: { op: 'delete', path: zonePath(toZone, 'from', fromZone) },
      label: `delete zone ${toZone} from ${fromZone}`,
    })
    setEditingCell(null)
  }

  if (zoneNames.length === 0) {
    return <p className="text-sm text-slate-500">No zones configured yet.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border-b border-r border-surface-border bg-surface-900 px-3 py-2 text-left font-medium text-slate-500">
              <span className="inline-flex items-center gap-1">
                From <span className="text-slate-600">\</span> To
                <InfoTooltip text="Each cell is the ruleset applied to traffic entering the column's zone, coming from the row's zone - read it as 'row → column'." />
              </span>
            </th>
            {zoneNames.map((toZone) => (
              <th
                key={toZone}
                className="border-b border-surface-border bg-surface-900 px-3 py-2 text-left font-mono font-medium text-slate-300"
              >
                {toZone}
                {zoneByName.get(toZone)?.localZone && (
                  <span className="ml-1 rounded bg-accent-600/20 px-1 py-0.5 text-[9px] font-medium uppercase text-accent-500">
                    local
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zoneNames.map((fromZone) => (
            <tr key={fromZone}>
              <th className="border-r border-surface-border bg-surface-900 px-3 py-2 text-left font-mono font-medium text-slate-300">
                {fromZone}
              </th>
              {zoneNames.map((toZone) => {
                const rulesetName = zoneByName.get(toZone)?.from[fromZone]
                const isEditing = editingCell?.from === fromZone && editingCell?.to === toZone
                return (
                  <td
                    key={toZone}
                    className="border-t border-surface-border bg-surface-900/50 px-3 py-2 hover:bg-surface-800"
                  >
                    {isEditing ? (
                      <MatrixCellEditor
                        rulesets={rulesets}
                        initialValue={rulesetName ?? ''}
                        onSave={(value) => queueSet(toZone, fromZone, value)}
                        onClear={() => queueRemove(toZone, fromZone)}
                        onCancel={() => setEditingCell(null)}
                        hasExistingValue={Boolean(rulesetName)}
                      />
                    ) : rulesetName ? (
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to={`/firewall/rulesets/${rulesetLink(rulesetName).family}/${rulesetLink(rulesetName).kind}/${encodeURIComponent(rulesetName)}`}
                          className="font-mono text-accent-500 hover:text-accent-400"
                        >
                          {rulesetName}
                        </Link>
                        <button
                          onClick={() => setEditingCell({ from: fromZone, to: toZone })}
                          className="text-slate-500 hover:text-slate-300"
                          aria-label={`Edit ruleset for traffic from ${fromZone} to ${toZone}`}
                        >
                          ✎
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingCell({ from: fromZone, to: toZone })}
                        className="text-slate-600 hover:text-accent-500"
                        aria-label={`Add ruleset for traffic from ${fromZone} to ${toZone}`}
                      >
                        + add
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MatrixCellEditor({
  rulesets,
  initialValue,
  onSave,
  onClear,
  onCancel,
  hasExistingValue,
}: {
  rulesets: FirewallRuleset[]
  initialValue: string
  onSave: (value: string) => void
  onClear: () => void
  onCancel: () => void
  hasExistingValue: boolean
}) {
  const [value, setValue] = useState(initialValue)

  return (
    <div className="flex items-center gap-1">
      <select
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`min-w-0 flex-1 ${inputClass}`}
      >
        <option value="">Select ruleset…</option>
        {rulesets.map((rs) => (
          <option key={`${rs.kind}-${rs.id}`} value={rs.id}>
            {rs.id}
          </option>
        ))}
      </select>
      <button
        onClick={() => value && onSave(value)}
        disabled={!value}
        className={`bg-accent-600 ${buttonClass}`}
      >
        Save
      </button>
      {hasExistingValue && (
        <button onClick={onClear} className="text-slate-500 hover:text-danger-500">
          Clear
        </button>
      )}
      <button onClick={onCancel} className="text-slate-500 hover:text-slate-300">
        ✕
      </button>
    </div>
  )
}
