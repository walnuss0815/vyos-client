import { useState } from 'react'
import ChipList from '../ChipList'
import { staticRoutePath } from '../../lib/routingParse'
import type { StaticRoute, StaticRouteRejectOrBlackhole } from '../../lib/routingTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** One static route destination: its next-hops, outbound interfaces,
 * DHCP-derived interfaces, and reject/blackhole state, each
 * independently add/removable. Mirrors dhcp/NetworkCard.tsx's
 * structure (one card per top-level entity, nested lists underneath). */
export default function StaticRouteCard({ route }: { route: StaticRoute }) {
  const add = usePendingChangesStore((s) => s.add)
  const basePath = staticRoutePath(route.family, route.destination)
  const chain = route.family === 'ipv6' ? 'route6' : 'route'
  const pathLabel = `protocols static ${chain} ${route.destination}`

  function queueDeleteRoute() {
    add({ op: { op: 'delete', path: basePath }, label: `delete ${pathLabel}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-mono text-sm font-medium text-white">{route.destination}</h3>
        <button onClick={queueDeleteRoute} className="text-xs text-slate-500 hover:text-danger-500">
          Delete route
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ViaSection
          title="Next hops"
          addLabel="+ Add next-hop"
          keyPlaceholder={route.family === 'ipv6' ? '2001:db8::1' : '10.0.0.254'}
          leaf="next-hop"
          entries={route.nextHops.map((nh) => ({ key: nh.address, disabled: nh.disabled, distance: nh.distance }))}
          basePath={basePath}
          pathLabel={pathLabel}
        />
        <ViaSection
          title="Interfaces"
          addLabel="+ Add interface"
          keyPlaceholder="eth0"
          leaf="interface"
          entries={route.interfaces.map((i) => ({
            key: i.interfaceName,
            disabled: i.disabled,
            distance: i.distance,
          }))}
          basePath={basePath}
          pathLabel={pathLabel}
        />
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">DHCP interfaces</p>
        <ChipList
          values={route.dhcpInterfaces}
          basePath={basePath}
          leaf="dhcp-interface"
          pathLabel={`${pathLabel} dhcp-interface`}
          placeholder="eth0"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RejectOrBlackholeSection kind="reject" value={route.reject} basePath={basePath} pathLabel={pathLabel} />
        <RejectOrBlackholeSection
          kind="blackhole"
          value={route.blackhole}
          basePath={basePath}
          pathLabel={pathLabel}
        />
      </div>
    </div>
  )
}

interface ViaEntry {
  key: string
  disabled: boolean
  distance?: string
}

/** Next-hop and interface entries share an identical shape (a tag node
 * keyed by address/interface-name, with its own optional distance and
 * disable flag) - genuinely the same structure, not just superficially
 * similar, so one shared component handles both (parametrized by
 * `leaf`), rather than duplicating it the way Firewall's zone/group
 * member chips were (those weren't actually identical). */
function ViaSection({
  title,
  addLabel,
  keyPlaceholder,
  leaf,
  entries,
  basePath,
  pathLabel,
}: {
  title: string
  addLabel: string
  keyPlaceholder: string
  leaf: 'next-hop' | 'interface'
  entries: ViaEntry[]
  basePath: string[]
  pathLabel: string
}) {
  const [showAdd, setShowAdd] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  function queueRemove(key: string) {
    add({
      op: { op: 'delete', path: [...basePath, leaf, key] },
      label: `delete ${pathLabel} ${leaf} ${key}`,
    })
  }

  function queueToggleDisabled(key: string, disabled: boolean) {
    const path = [...basePath, leaf, key, 'disable']
    add({
      op: disabled ? { op: 'delete', path } : { op: 'set', path },
      label: `${disabled ? 'delete' : 'set'} ${pathLabel} ${leaf} ${key} disable`,
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{title}</p>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-xs text-accent-500 hover:text-accent-400"
        >
          {showAdd ? 'Cancel' : addLabel}
        </button>
      </div>

      {showAdd && (
        <AddViaForm
          leaf={leaf}
          keyPlaceholder={keyPlaceholder}
          existingKeys={entries.map((e) => e.key)}
          basePath={basePath}
          pathLabel={pathLabel}
          onDone={() => setShowAdd(false)}
        />
      )}

      <ul className="mt-1 space-y-1">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono text-slate-300">
              {entry.key}
              {entry.distance && <span className="text-slate-500"> distance {entry.distance}</span>}
              {entry.disabled && <span className="ml-1 text-slate-500">(disabled)</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => queueToggleDisabled(entry.key, entry.disabled)}
                className="text-accent-500 hover:text-accent-400"
              >
                {entry.disabled ? 'Enable' : 'Disable'}
              </button>
              <button
                onClick={() => queueRemove(entry.key)}
                className="text-slate-500 hover:text-danger-500"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
        {entries.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
    </div>
  )
}

function AddViaForm({
  leaf,
  keyPlaceholder,
  existingKeys,
  basePath,
  pathLabel,
  onDone,
}: {
  leaf: 'next-hop' | 'interface'
  keyPlaceholder: string
  existingKeys: string[]
  basePath: string[]
  pathLabel: string
  onDone: () => void
}) {
  const [key, setKey] = useState('')
  const [distance, setDistance] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedKey = key.trim()
  const valid = trimmedKey !== '' && !existingKeys.includes(trimmedKey)

  function submit() {
    if (!valid) return
    const entryPath = [...basePath, leaf, trimmedKey]
    // Always queued unconditionally, even with no distance: this is
    // what actually creates the tag node (setting only `distance`
    // below would auto-create it as a side effect too, but only if
    // the user filled it in - a next-hop/interface with no distance
    // override still needs to exist).
    add({ op: { op: 'set', path: entryPath }, label: `set ${pathLabel} ${leaf} ${trimmedKey}` })
    const trimmedDistance = distance.trim()
    if (trimmedDistance) {
      add({
        op: { op: 'set', path: [...entryPath, 'distance'], value: trimmedDistance },
        label: `set ${pathLabel} ${leaf} ${trimmedKey} distance '${trimmedDistance}'`,
      })
    }
    onDone()
  }

  return (
    <div className="my-2 flex items-center gap-2">
      <input
        {...noExtensionInputProps}
        autoFocus
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={keyPlaceholder}
        className={inputClass}
      />
      <input
        {...noExtensionInputProps}
        value={distance}
        onChange={(e) => setDistance(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="distance (optional)"
        className={`w-32 ${inputClass}`}
      />
      <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
        Add
      </button>
    </div>
  )
}

function RejectOrBlackholeSection({
  kind,
  value,
  basePath,
  pathLabel,
}: {
  kind: 'reject' | 'blackhole'
  value: StaticRouteRejectOrBlackhole | undefined
  basePath: string[]
  pathLabel: string
}) {
  const [editing, setEditing] = useState(false)
  const [distance, setDistance] = useState(value?.distance ?? '')
  const [tag, setTag] = useState(value?.tag ?? '')
  const add = usePendingChangesStore((s) => s.add)
  const label = kind === 'reject' ? 'Reject' : 'Blackhole'

  function queueEnable() {
    const path = [...basePath, kind]
    add({ op: { op: 'set', path }, label: `set ${pathLabel} ${kind}` })
    const trimmedDistance = distance.trim()
    if (trimmedDistance) {
      add({
        op: { op: 'set', path: [...path, 'distance'], value: trimmedDistance },
        label: `set ${pathLabel} ${kind} distance '${trimmedDistance}'`,
      })
    }
    const trimmedTag = tag.trim()
    if (trimmedTag) {
      add({
        op: { op: 'set', path: [...path, 'tag'], value: trimmedTag },
        label: `set ${pathLabel} ${kind} tag '${trimmedTag}'`,
      })
    }
    setEditing(false)
  }

  function queueRemove() {
    add({ op: { op: 'delete', path: [...basePath, kind] }, label: `delete ${pathLabel} ${kind}` })
    setDistance('')
    setTag('')
  }

  if (value === undefined && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="self-start text-xs text-accent-500 hover:text-accent-400"
      >
        + Add {label.toLowerCase()}
      </button>
    )
  }

  if (editing) {
    return (
      <div className="rounded border border-surface-border p-2">
        <p className="mb-1 text-xs text-slate-500">{label}</p>
        <div className="flex items-center gap-2">
          <input
            {...noExtensionInputProps}
            autoFocus
            value={distance}
            onChange={(e) => setDistance(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="distance"
            className={`w-20 ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={tag}
            onChange={(e) => setTag(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="tag"
            className={`w-24 ${inputClass}`}
          />
          <button onClick={queueEnable} className={`bg-accent-600 ${buttonClass}`}>
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-mono text-slate-300">
        {label}
        {value?.distance && <span className="text-slate-500"> distance {value.distance}</span>}
        {value?.tag && <span className="text-slate-500"> tag {value.tag}</span>}
      </span>
      <button onClick={queueRemove} className="text-slate-500 hover:text-danger-500">
        Remove
      </button>
    </div>
  )
}
