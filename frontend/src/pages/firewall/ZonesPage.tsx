import { useState } from 'react'
import { zonePath } from '../../lib/firewallParse'
import type { FirewallZone } from '../../lib/firewallTypes'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { useFirewallConfig } from '../../hooks/useFirewallConfig'
import { usePendingChangesStore } from '../../store/pendingChanges'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { isValidVyOSIdentifier } from '../../lib/vyosIdentifier'
import ZoneMatrix from '../../components/firewall/ZoneMatrix'
import FieldLabel from '../../components/FieldLabel'
import InfoTooltip from '../../components/InfoTooltip'

type View = 'list' | 'matrix'

export default function ZonesPage() {
  const { zones, rulesets, isLoading, isError } = useFirewallConfig()
  const [showCreate, setShowCreate] = useState(false)
  const [view, setView] = useState<View>('list')

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-400">
          A zone groups interfaces with similar trust; traffic between zones is controlled by the
          rulesets assigned in each zone's "from" list.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label="View"
            className="flex rounded-lg border border-surface-border p-0.5"
          >
            <button
              onClick={() => setView('list')}
              className={`rounded px-2 py-1 text-xs font-medium transition ${
                view === 'list' ? 'bg-accent-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView('matrix')}
              className={`rounded px-2 py-1 text-xs font-medium transition ${
                view === 'matrix' ? 'bg-accent-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Matrix
            </button>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className={`bg-accent-600 ${buttonClass}`}
          >
            {showCreate ? 'Cancel' : '+ New zone'}
          </button>
        </div>
      </div>

      {showCreate && <CreateZoneForm onDone={() => setShowCreate(false)} />}

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load firewall configuration.</p>}

      {view === 'matrix' ? (
        <ZoneMatrix zones={zones} rulesets={rulesets} />
      ) : (
        <div className="space-y-3">
          {zones.map((zone) => (
            <ZoneCard key={zone.name} zone={zone} />
          ))}
          {!isLoading && zones.length === 0 && (
            <p className="text-sm text-slate-500">No zones configured yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

function CreateZoneForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [interfaces, setInterfaces] = useState('')
  const [localZone, setLocalZone] = useState(false)
  const [defaultAction, setDefaultAction] = useState<'drop' | 'reject'>('drop')
  const [firstFromZone, setFirstFromZone] = useState('')
  const [firstFromRuleset, setFirstFromRuleset] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const ifaceList = interfaces
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const valid = isValidVyOSIdentifier(name.trim()) && (localZone || ifaceList.length > 0)

  function submit() {
    if (!valid) return
    const zoneName = name.trim()
    if (localZone) {
      add({ op: { op: 'set', path: zonePath(zoneName, 'local-zone') }, label: `set zone ${zoneName} local-zone` })
    } else {
      for (const iface of ifaceList) {
        add({
          op: { op: 'set', path: zonePath(zoneName, 'interface'), value: iface },
          label: `set zone ${zoneName} interface '${iface}'`,
        })
      }
    }
    add({
      op: { op: 'set', path: zonePath(zoneName, 'default-action'), value: defaultAction },
      label: `set zone ${zoneName} default-action '${defaultAction}'`,
    })
    // Source-zone ruleset assignments used to only be addable AFTER
    // the zone already existed - ZoneCard's "from" list only ever
    // operates on an already-fetched zone. Not a VyOS commit-blocking
    // requirement, but this zone's own name is already known here, so
    // queuing a first assignment avoids a detour through commit+
    // refetch just to add one.
    if (firstFromZone.trim() && firstFromRuleset.trim()) {
      add({
        op: {
          op: 'set',
          path: zonePath(zoneName, 'from', firstFromZone.trim(), 'firewall', 'name'),
          value: firstFromRuleset.trim(),
        },
        label: `set zone ${zoneName} from ${firstFromZone.trim()} firewall name '${firstFromRuleset.trim()}'`,
      })
    }
    onDone()
  }

  return (
    <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Name
          <input
            {...noExtensionInputProps}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="LAN"
            className={inputClass}
          />
        </label>
        <FieldLabel label="Default action" hint="drop silently discards traffic with no reply to the sender; reject discards it but sends back an ICMP/TCP-RST refusal.">
          <select
            value={defaultAction}
            onChange={(e) => setDefaultAction(e.target.value as 'drop' | 'reject')}
            className={inputClass}
          >
            <option value="drop">drop</option>
            <option value="reject">reject</option>
          </select>
        </FieldLabel>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={localZone}
          onChange={(e) => setLocalZone(e.target.checked)}
          className="accent-accent-500"
        />
        This is the local zone (traffic to/from the router itself)
        <InfoTooltip text="Every VyOS router has exactly one local zone, covering traffic destined to or originating from the router itself - not traffic merely passing through it." />
      </label>

      {!localZone && (
        <label className={`mt-3 ${labelClass}`}>
          Member interfaces (comma-separated)
          <input
            {...noExtensionInputProps}
            value={interfaces}
            onChange={(e) => setInterfaces(e.target.value)}
            placeholder="eth1, eth2"
            className={inputClass}
          />
        </label>
      )}

      <div className="mt-3 border-t border-surface-border pt-3">
        <p className="mb-2 text-xs text-slate-500">First ruleset assignment (optional)</p>
        <div className="flex items-center gap-2">
          <input
            {...noExtensionInputProps}
            value={firstFromZone}
            onChange={(e) => setFirstFromZone(e.target.value)}
            placeholder="source zone"
            className={`w-28 ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={firstFromRuleset}
            onChange={(e) => setFirstFromRuleset(e.target.value)}
            placeholder="ruleset name"
            className={inputClass}
          />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!valid}
        className={`mt-3 bg-accent-600 ${buttonClass}`}
      >
        Queue zone creation
      </button>
    </div>
  )
}

function ZoneCard({ zone }: { zone: FirewallZone }) {
  const [newInterface, setNewInterface] = useState('')
  const [newFromZone, setNewFromZone] = useState('')
  const [newFromRuleset, setNewFromRuleset] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  function queueDeleteZone() {
    add({ op: { op: 'delete', path: zonePath(zone.name) }, label: `delete zone ${zone.name}` })
  }

  function queueSetDefaultAction(value: string) {
    add({
      op: { op: 'set', path: zonePath(zone.name, 'default-action'), value },
      label: `set zone ${zone.name} default-action '${value}'`,
    })
  }

  function queueAddInterface() {
    if (!newInterface) return
    add({
      op: { op: 'set', path: zonePath(zone.name, 'interface'), value: newInterface },
      label: `set zone ${zone.name} interface '${newInterface}'`,
    })
    setNewInterface('')
  }

  function queueRemoveInterface(iface: string) {
    add({
      op: { op: 'delete', path: zonePath(zone.name, 'interface'), value: iface },
      label: `delete zone ${zone.name} interface '${iface}'`,
    })
  }

  function queueAddFrom() {
    if (!newFromZone || !newFromRuleset) return
    add({
      op: {
        op: 'set',
        path: zonePath(zone.name, 'from', newFromZone, 'firewall', 'name'),
        value: newFromRuleset,
      },
      label: `set zone ${zone.name} from ${newFromZone} firewall name '${newFromRuleset}'`,
    })
    setNewFromZone('')
    setNewFromRuleset('')
  }

  function queueRemoveFrom(srcZone: string) {
    add({
      op: { op: 'delete', path: zonePath(zone.name, 'from', srcZone) },
      label: `delete zone ${zone.name} from ${srcZone}`,
    })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm font-medium text-white">{zone.name}</h3>
            {zone.localZone && (
              <span className="rounded bg-accent-600/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-accent-500">
                Local zone
              </span>
            )}
          </div>
          {zone.description && <p className="mt-0.5 text-xs text-slate-400">{zone.description}</p>}
        </div>
        <button onClick={queueDeleteZone} className="text-xs text-slate-500 hover:text-danger-500">
          Delete zone
        </button>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-slate-500">Default action</span>
        <InfoTooltip text="drop silently discards traffic with no reply to the sender; reject discards it but sends back an ICMP/TCP-RST refusal." />
        <select
          value={zone.defaultAction ?? 'drop'}
          onChange={(e) => queueSetDefaultAction(e.target.value)}
          className={inputClass}
        >
          <option value="drop">drop</option>
          <option value="reject">reject</option>
        </select>
      </label>

      {!zone.localZone && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">Member interfaces</p>
          <div className="flex flex-wrap gap-1.5">
            {zone.interfaces.map((iface) => (
              <span
                key={iface}
                className="flex items-center gap-1 rounded bg-surface-800 px-2 py-0.5 font-mono text-xs text-slate-300"
              >
                {iface}
                <button
                  onClick={() => queueRemoveInterface(iface)}
                  className="text-slate-500 hover:text-danger-500"
                  aria-label={`Remove interface ${iface} from zone ${zone.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              {...noExtensionInputProps}
              value={newInterface}
              onChange={(e) => setNewInterface(e.target.value)}
              placeholder="eth3"
              className={inputClass}
            />
            <button onClick={queueAddInterface} disabled={!newInterface} className={`bg-accent-600 ${buttonClass}`}>
              Add interface
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
          Rulesets applied to traffic from…
          <InfoTooltip text="For each source zone, the ruleset assigned here is evaluated on traffic entering this zone from that source - no entry means no ruleset-based filtering between those two zones." />
        </p>
        <ul className="space-y-1">
          {Object.entries(zone.from).map(([srcZone, ruleset]) => (
            <li key={srcZone} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-slate-300">
                {srcZone} <span className="text-slate-500">→</span> {ruleset}
              </span>
              <button
                onClick={() => queueRemoveFrom(srcZone)}
                className="text-slate-500 hover:text-danger-500"
              >
                Remove
              </button>
            </li>
          ))}
          {Object.keys(zone.from).length === 0 && (
            <li className="text-xs text-slate-500">No source zones configured.</li>
          )}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <input
            {...noExtensionInputProps}
            value={newFromZone}
            onChange={(e) => setNewFromZone(e.target.value)}
            placeholder="source zone"
            className={`w-28 ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={newFromRuleset}
            onChange={(e) => setNewFromRuleset(e.target.value)}
            placeholder="ruleset name"
            className={inputClass}
          />
          <button
            onClick={queueAddFrom}
            disabled={!newFromZone || !newFromRuleset}
            className={`bg-accent-600 ${buttonClass}`}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
