import { useState } from 'react'
import ChipList from '../ChipList'
import { routerAdvertInterfacePath } from '../../lib/serviceRouterAdvertParse'
import {
  addRouterAdvertPrefixOps,
  addRouterAdvertRouteOps,
  blankRouterAdvertInterfaceFormValues,
  deleteRouterAdvertInterfaceOp,
  removeRouterAdvertPrefixOp,
  removeRouterAdvertRouteOp,
  routerAdvertInterfaceFormToOps,
  routerAdvertInterfaceToFormValues,
  type RouterAdvertInterfaceFormValues,
} from '../../lib/serviceRouterAdvertForm'
import {
  RA_PREFERENCES,
  type RouterAdvertConfig,
  type RouterAdvertInterface,
} from '../../lib/serviceRouterAdvertTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function RouterAdvertList({ config }: { config: RouterAdvertConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteRouterAdvertInterfaceOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? config.interfaces.find((i) => i.interfaceName === editingName) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Interfaces advertising RAs ({config.interfaces.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ Enable on interface'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Enabling Router Advertisements on an interface is done simply by adding it here - VyOS
        applies sensible defaults for anything left blank.
      </p>

      {showCreate && (
        <div className="mb-3">
          <InterfaceForm
            existingNames={config.interfaces.map((i) => i.interfaceName)}
            onDone={() => setShowCreate(false)}
          />
        </div>
      )}
      {editing && (
        <div className="mb-3">
          <InterfaceForm
            iface={editing}
            existingNames={config.interfaces.map((i) => i.interfaceName)}
            onDone={() => setEditingName(null)}
          />
        </div>
      )}

      <div className="space-y-3">
        {config.interfaces.map((iface) => (
          <div key={iface.interfaceName} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-medium text-white">{iface.interfaceName}</span>
                {iface.noSendAdvert && (
                  <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-500">
                    not sending
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => setExpandedName((n) => (n === iface.interfaceName ? null : iface.interfaceName))}
                  className="text-accent-500 hover:text-accent-400"
                >
                  {expandedName === iface.interfaceName ? 'Hide details' : 'Details'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(iface.interfaceName)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(iface.interfaceName)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>

            {expandedName === iface.interfaceName && <InterfaceDetails iface={iface} />}
          </div>
        ))}
        {config.interfaces.length === 0 && <p className="text-xs text-slate-500">RA is not enabled on any interface.</p>}
      </div>
    </div>
  )
}

function InterfaceForm({
  iface,
  existingNames,
  onDone,
}: {
  iface?: RouterAdvertInterface
  existingNames: string[]
  onDone: () => void
}) {
  const [interfaceName, setInterfaceName] = useState(iface?.interfaceName ?? '')
  const [values, setValues] = useState<RouterAdvertInterfaceFormValues>(
    iface ? routerAdvertInterfaceToFormValues(iface) : blankRouterAdvertInterfaceFormValues(),
  )
  const [firstPrefix, setFirstPrefix] = useState('')
  const [firstRoutePrefix, setFirstRoutePrefix] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = iface === undefined
  const trimmedName = interfaceName.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof RouterAdvertInterfaceFormValues>(key: K, value: RouterAdvertInterfaceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = routerAdvertInterfaceFormToOps(trimmedName, iface, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    // An interface's prefixes and routes used to only be configurable
    // AFTER RA was already enabled on it - PrefixesSection/
    // RoutesSection only ever operate on an already-fetched
    // interface. Queuing a first one of each here, in the same
    // commit as enabling RA itself, avoids a detour through
    // commit+refetch.
    if (isCreate && firstPrefix.trim()) {
      const prefixOps = addRouterAdvertPrefixOps(trimmedName, firstPrefix.trim(), {
        noAutonomousFlag: false,
        noOnLinkFlag: false,
        deprecatePrefix: false,
        decrementLifetime: false,
        baseInterface: '',
        preferredLifetime: '',
        validLifetime: '',
      })
      for (const op of prefixOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    if (isCreate && firstRoutePrefix.trim()) {
      const routeOps = addRouterAdvertRouteOps(trimmedName, firstRoutePrefix.trim(), {
        validLifetime: '',
        routePreference: '',
        noRemoveRoute: false,
      })
      for (const op of routeOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">
        {isCreate ? 'Enable RA on interface' : `Edit ${iface.interfaceName}`}
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Interface *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={interfaceName}
            onChange={(e) => setInterfaceName(e.target.value)}
            placeholder="eth0"
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">RA is already enabled on this interface.</span>}
        </label>
        <label className={labelClass}>
          Hop limit
          <input {...noExtensionInputProps} value={values.hopLimit} onChange={(e) => update('hopLimit', e.target.value)} placeholder="64" className={inputClass} />
        </label>
        <label className={labelClass}>
          Default lifetime (s)
          <input {...noExtensionInputProps} value={values.defaultLifetime} onChange={(e) => update('defaultLifetime', e.target.value)} className={inputClass} />
        </label>
        <FieldLabel
          label="Default preference"
          hint="Hints to receiving hosts how attractive this router is as a default gateway relative to others advertising on the same link - only meaningful when more than one router is advertising."
        >
          <select value={values.defaultPreference} onChange={(e) => update('defaultPreference', e.target.value)} className={inputClass}>
            <option value="">Default (medium)</option>
            {RA_PREFERENCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          Link MTU
          <input {...noExtensionInputProps} value={values.linkMtu} onChange={(e) => update('linkMtu', e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Interval max (s)
          <input {...noExtensionInputProps} value={values.intervalMax} onChange={(e) => update('intervalMax', e.target.value)} placeholder="600" className={inputClass} />
        </label>
        <label className={labelClass}>
          Interval min (s)
          <input {...noExtensionInputProps} value={values.intervalMin} onChange={(e) => update('intervalMin', e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Name server lifetime (s)
          <input {...noExtensionInputProps} value={values.nameServerLifetime} onChange={(e) => update('nameServerLifetime', e.target.value)} className={inputClass} />
        </label>
        <FieldLabel label="Reachable time (ms)" hint="How long a receiving host considers a discovered neighbor reachable without re-confirming it - 0 means unspecified/use the host's own default.">
          <input {...noExtensionInputProps} value={values.reachableTime} onChange={(e) => update('reachableTime', e.target.value)} placeholder="0" className={inputClass} />
        </FieldLabel>
        <FieldLabel label="Retrans timer (ms)" hint="How often a receiving host retransmits neighbor-solicitation requests while resolving an address - 0 means unspecified/use the host's own default.">
          <input {...noExtensionInputProps} value={values.retransTimer} onChange={(e) => update('retransTimer', e.target.value)} placeholder="0" className={inputClass} />
        </FieldLabel>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.managedFlag} onChange={(e) => update('managedFlag', e.target.checked)} className="accent-accent-500" />
          Managed (use DHCPv6 for addressing)
          <InfoTooltip text="Sets the M-flag: tells receiving hosts to get their address from DHCPv6 rather than (or in addition to) SLAAC autoconfiguration." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.otherConfigFlag} onChange={(e) => update('otherConfigFlag', e.target.checked)} className="accent-accent-500" />
          Other-config (use DHCPv6 for other settings)
          <InfoTooltip text="Sets the O-flag: tells receiving hosts to fetch other settings (DNS, domain search, etc.) from DHCPv6, independent of how they get their address." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.noSendAdvert} onChange={(e) => update('noSendAdvert', e.target.checked)} className="accent-accent-500" />
          Don't actually send advertisements
          <InfoTooltip text="Keeps this configuration in place without transmitting any RA packets on the wire - useful for staging a config or temporarily pausing without deleting everything." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.noSendInterval} onChange={(e) => update('noSendInterval', e.target.checked)} className="accent-accent-500" />
          Omit advertisement interval option
          <InfoTooltip text="Leaves out the optional field stating how often advertisements are sent - some older/simpler clients don't expect it and can be confused by its presence." />
        </label>
      </div>

      {isCreate && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-surface-border pt-3">
          <label className={labelClass}>
            First prefix (optional)
            <input
              {...noExtensionInputProps}
              value={firstPrefix}
              onChange={(e) => setFirstPrefix(e.target.value)}
              placeholder="2001:db8::/64"
              className={`font-mono ${inputClass}`}
            />
          </label>
          <label className={labelClass}>
            First route (optional)
            <input
              {...noExtensionInputProps}
              value={firstRoutePrefix}
              onChange={(e) => setFirstRoutePrefix(e.target.value)}
              placeholder="2001:db8:1::/64"
              className={`font-mono ${inputClass}`}
            />
          </label>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Enable' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

function InterfaceDetails({ iface }: { iface: RouterAdvertInterface }) {
  return (
    <div className="mt-3 space-y-4 border-t border-surface-border pt-3">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">DNS search list</p>
          <ChipList
            values={iface.dnssl}
            basePath={routerAdvertInterfacePath(iface.interfaceName)}
            leaf="dnssl"
            pathLabel={`service router-advert interface ${iface.interfaceName} dnssl`}
            placeholder="example.com"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Name servers</p>
          <ChipList
            values={iface.nameServers}
            basePath={routerAdvertInterfacePath(iface.interfaceName)}
            leaf="name-server"
            pathLabel={`service router-advert interface ${iface.interfaceName} name-server`}
            placeholder="2001:db8::1"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Source addresses</p>
          <ChipList
            values={iface.sourceAddresses}
            basePath={routerAdvertInterfacePath(iface.interfaceName)}
            leaf="source-address"
            pathLabel={`service router-advert interface ${iface.interfaceName} source-address`}
            placeholder="2001:db8::2"
          />
        </div>
      </div>

      <PrefixesSection iface={iface} />
      <RoutesSection iface={iface} />
    </div>
  )
}

function PrefixesSection({ iface }: { iface: RouterAdvertInterface }) {
  const [showAdd, setShowAdd] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [noAutonomousFlag, setNoAutonomousFlag] = useState(false)
  const [noOnLinkFlag, setNoOnLinkFlag] = useState(false)
  const [preferredLifetime, setPreferredLifetime] = useState('')
  const [validLifetime, setValidLifetime] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedPrefix = prefix.trim()
  const taken = iface.prefixes.some((p) => p.prefix === trimmedPrefix)
  const valid = trimmedPrefix !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addRouterAdvertPrefixOps(iface.interfaceName, trimmedPrefix, {
      noAutonomousFlag,
      noOnLinkFlag,
      deprecatePrefix: false,
      decrementLifetime: false,
      baseInterface: '',
      preferredLifetime,
      validLifetime,
    })
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setPrefix('')
    setNoAutonomousFlag(false)
    setNoOnLinkFlag(false)
    setPreferredLifetime('')
    setValidLifetime('')
    setShowAdd(false)
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Prefix advertisements</p>
      {iface.prefixes.map((p) => (
        <div key={p.prefix} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {p.prefix}
            {p.validLifetime && <span className="text-slate-500"> valid={p.validLifetime}</span>}
          </span>
          <button
            onClick={() => {
              const op = removeRouterAdvertPrefixOp(iface.interfaceName, p.prefix)
              add({ op, label: `delete ${op.path.join(' ')}` })
            }}
            className="text-xs text-slate-500 hover:text-danger-500"
          >
            Remove
          </button>
        </div>
      ))}
      {iface.prefixes.length === 0 && <p className="text-xs text-slate-500">No prefixes advertised.</p>}

      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add prefix'}
      </button>
      {showAdd && (
        <div className="mt-2 space-y-2">
          <input {...noExtensionInputProps} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="2001:db8::/64" className={`w-full ${inputClass}`} />
          <div className="grid grid-cols-2 gap-2">
            <input {...noExtensionInputProps} value={preferredLifetime} onChange={(e) => setPreferredLifetime(e.target.value)} placeholder="preferred-lifetime (s or infinity)" className={inputClass} />
            <input {...noExtensionInputProps} value={validLifetime} onChange={(e) => setValidLifetime(e.target.value)} placeholder="valid-lifetime (s or infinity)" className={inputClass} />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={noAutonomousFlag} onChange={(e) => setNoAutonomousFlag(e.target.checked)} className="accent-accent-500" />
              No autonomous flag
              <InfoTooltip text="Tells hosts not to self-generate a SLAAC address from this prefix - use when addresses for it should only come from DHCPv6 or manual configuration." />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input type="checkbox" checked={noOnLinkFlag} onChange={(e) => setNoOnLinkFlag(e.target.checked)} className="accent-accent-500" />
              No on-link flag
              <InfoTooltip text="Tells hosts this prefix isn't directly reachable on this link - they'll route through a gateway instead of assuming they can reach other addresses in it directly." />
            </label>
          </div>
          <button onClick={submit} disabled={!valid} className={`w-full bg-accent-600 ${buttonClass}`}>
            Add prefix
          </button>
          {taken && <p className="text-xs text-danger-500">This prefix is already advertised.</p>}
        </div>
      )}
    </div>
  )
}

function RoutesSection({ iface }: { iface: RouterAdvertInterface }) {
  const [showAdd, setShowAdd] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [validLifetime, setValidLifetime] = useState('')
  const [routePreference, setRoutePreference] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedPrefix = prefix.trim()
  const taken = iface.routes.some((r) => r.prefix === trimmedPrefix)
  const valid = trimmedPrefix !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addRouterAdvertRouteOps(iface.interfaceName, trimmedPrefix, {
      validLifetime,
      routePreference,
      noRemoveRoute: false,
    })
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setPrefix('')
    setValidLifetime('')
    setRoutePreference('')
    setShowAdd(false)
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Route advertisements</p>
      {iface.routes.map((r) => (
        <div key={r.prefix} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {r.prefix}
            {r.routePreference && <span className="text-slate-500"> ({r.routePreference})</span>}
          </span>
          <button
            onClick={() => {
              const op = removeRouterAdvertRouteOp(iface.interfaceName, r.prefix)
              add({ op, label: `delete ${op.path.join(' ')}` })
            }}
            className="text-xs text-slate-500 hover:text-danger-500"
          >
            Remove
          </button>
        </div>
      ))}
      {iface.routes.length === 0 && <p className="text-xs text-slate-500">No routes advertised.</p>}

      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add route'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="2001:db8:1::/64" className={inputClass} />
          <input {...noExtensionInputProps} value={validLifetime} onChange={(e) => setValidLifetime(e.target.value)} placeholder="valid-lifetime" className={inputClass} />
          <select value={routePreference} onChange={(e) => setRoutePreference(e.target.value)} className={inputClass}>
            <option value="">Default (medium)</option>
            {RA_PREFERENCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>
            Add route
          </button>
          {taken && <p className="col-span-3 text-xs text-danger-500">This route is already advertised.</p>}
        </div>
      )}
    </div>
  )
}
