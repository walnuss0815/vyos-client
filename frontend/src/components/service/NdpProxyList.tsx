import { useState } from 'react'
import {
  addNDPProxyPrefixOps,
  blankNDPProxyInterfaceFormValues,
  deleteNDPProxyInterfaceOp,
  disableNDPProxyOp,
  enableNDPProxyOp,
  ndpProxyGlobalFormToOps,
  ndpProxyInterfaceFormToOps,
  ndpProxyInterfaceToFormValues,
  removeNDPProxyPrefixOp,
  type NDPProxyInterfaceFormValues,
} from '../../lib/serviceNdpProxyForm'
import { NDP_PROXY_MODES, type NDPProxyConfig, type NDPProxyInterface } from '../../lib/serviceNdpProxyTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function NdpProxyList({ config }: { config: NDPProxyConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">NDP proxy is not configured.</p>
        <button
          onClick={() => {
            const op = enableNDPProxyOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable NDP proxy
        </button>
      </div>
    )
  }

  return <NdpProxyEnabled config={config} />
}

function NdpProxyEnabled({ config }: { config: NDPProxyConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [globalValues, setGlobalValues] = useState(() => ({ routeRefresh: config.routeRefresh ?? '' }))
  const add = usePendingChangesStore((s) => s.add)

  function saveGlobal() {
    const ops = ndpProxyGlobalFormToOps(config, globalValues)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDelete(name: string) {
    const op = deleteNDPProxyInterfaceOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  function queueDisable() {
    const op = disableNDPProxyOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? config.interfaces.find((i) => i.interfaceName === editingName) : undefined

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <FieldLabel label="Route refresh interval (ms)" hint="How often ndppd re-checks the kernel routing table to decide which proxied addresses are still reachable via the target interface (for 'interface'-mode prefixes below).">
          <input
            {...noExtensionInputProps}
            value={globalValues.routeRefresh}
            onChange={(e) => setGlobalValues({ routeRefresh: e.target.value })}
            placeholder="30000"
            className={`${inputClass} w-40`}
          />
        </FieldLabel>
        <button onClick={saveGlobal} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
            Listener interfaces ({config.interfaces.length})
            <InfoTooltip text="Each interface here answers IPv6 neighbor-solicitation requests on behalf of the proxied prefixes configured below it - useful for extending an upstream /64 across a router that doesn't itself route between the segments." />
          </h2>
          <button
            onClick={() => {
              setShowCreate((v) => !v)
              setEditingName(null)
            }}
            className={`bg-accent-600 ${buttonClass}`}
          >
            {showCreate ? 'Cancel' : '+ New interface'}
          </button>
        </div>

        {showCreate && (
          <div className="mb-3">
            <InterfaceForm existingNames={config.interfaces.map((i) => i.interfaceName)} onDone={() => setShowCreate(false)} />
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
                  {iface.disabled && (
                    <span className="ml-2 rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">
                      disabled
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
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
              <PrefixesSection iface={iface} />
            </div>
          ))}
          {config.interfaces.length === 0 && <p className="text-xs text-slate-500">No interfaces configured yet.</p>}
        </div>
      </div>

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable NDP proxy entirely
        </button>
      </div>
    </div>
  )
}

function InterfaceForm({
  iface,
  existingNames,
  onDone,
}: {
  iface?: NDPProxyInterface
  existingNames: string[]
  onDone: () => void
}) {
  const [interfaceName, setInterfaceName] = useState(iface?.interfaceName ?? '')
  const [values, setValues] = useState<NDPProxyInterfaceFormValues>(
    iface ? ndpProxyInterfaceToFormValues(iface) : blankNDPProxyInterfaceFormValues(),
  )
  const [firstPrefix, setFirstPrefix] = useState('')
  const [firstPrefixMode, setFirstPrefixMode] = useState('')
  const [firstPrefixInterfaceRef, setFirstPrefixInterfaceRef] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = iface === undefined
  const trimmedName = interfaceName.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof NDPProxyInterfaceFormValues>(key: K, value: NDPProxyInterfaceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = ndpProxyInterfaceFormToOps(trimmedName, iface, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    // An interface's proxied prefixes used to only be configurable
    // AFTER the interface already existed - PrefixesSection only
    // ever operates on an already-fetched interface. Queuing a first
    // one here, in the same commit as the interface itself, avoids a
    // detour through commit+refetch.
    if (isCreate && firstPrefix.trim()) {
      const prefixOps = addNDPProxyPrefixOps(trimmedName, firstPrefix.trim(), {
        mode: firstPrefixMode,
        interfaceRef: firstPrefixInterfaceRef,
        disabled: false,
      })
      for (const op of prefixOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New interface' : `Edit ${iface.interfaceName}`}</h3>
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
          {nameTaken && <span className="text-danger-500">This interface already has NDP proxy configured.</span>}
        </label>
        <FieldLabel label="Timeout (ms)" hint="How long to wait for a neighbor-solicitation response before giving up on that lookup attempt.">
          <input {...noExtensionInputProps} value={values.timeout} onChange={(e) => update('timeout', e.target.value)} placeholder="500" className={inputClass} />
        </FieldLabel>
        <FieldLabel label="TTL (ms)" hint="How long a resolved proxy entry stays cached before it must be re-verified.">
          <input {...noExtensionInputProps} value={values.ttl} onChange={(e) => update('ttl', e.target.value)} placeholder="30000" className={inputClass} />
        </FieldLabel>
      </div>
      <div className="mt-3 flex gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.disabled} onChange={(e) => update('disabled', e.target.checked)} className="accent-accent-500" />
          Disable
          <InfoTooltip text="Stops proxying on this interface while leaving its configured prefixes in place, so it can be re-enabled later without re-entering them." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.enableRouterBit} onChange={(e) => update('enableRouterBit', e.target.checked)} className="accent-accent-500" />
          Enable router bit
          <InfoTooltip text="Sets the 'R' flag in the proxied neighbor advertisements, telling receiving hosts this proxy can also act as their default gateway." />
        </label>
      </div>

      {isCreate && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">First proxied prefix (optional)</p>
          <div className="grid grid-cols-3 gap-2">
            <input
              {...noExtensionInputProps}
              value={firstPrefix}
              onChange={(e) => setFirstPrefix(e.target.value)}
              placeholder="2001:db8::/64"
              className={`font-mono ${inputClass}`}
            />
            <select value={firstPrefixMode} onChange={(e) => setFirstPrefixMode(e.target.value)} className={inputClass}>
              <option value="">Default (static)</option>
              {NDP_PROXY_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {firstPrefixMode === 'interface' && (
              <input
                {...noExtensionInputProps}
                value={firstPrefixInterfaceRef}
                onChange={(e) => setFirstPrefixInterfaceRef(e.target.value)}
                placeholder="target interface"
                className={`font-mono ${inputClass}`}
              />
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

function PrefixesSection({ iface }: { iface: NDPProxyInterface }) {
  const [showAdd, setShowAdd] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [mode, setMode] = useState('')
  const [interfaceRef, setInterfaceRef] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedPrefix = prefix.trim()
  const taken = iface.prefixes.some((p) => p.prefix === trimmedPrefix)
  const valid = trimmedPrefix !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addNDPProxyPrefixOps(iface.interfaceName, trimmedPrefix, { mode, interfaceRef, disabled: false })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setPrefix('')
    setMode('')
    setInterfaceRef('')
    setShowAdd(false)
  }

  return (
    <div className="mt-2">
      <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
        Proxied prefixes
        <InfoTooltip text="static always answers for every address in the prefix; auto only answers for addresses actually present in the kernel routing table; interface forwards each request to a different target interface for verification." />
      </p>
      {iface.prefixes.map((p) => (
        <div key={p.prefix} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {p.prefix}
            {p.mode && <span className="text-slate-500"> ({p.mode}{p.interface ? ` via ${p.interface}` : ''})</span>}
          </span>
          <button
            onClick={() => {
              const op = removeNDPProxyPrefixOp(iface.interfaceName, p.prefix)
              add({ op, label: `delete ${op.path.join(' ')}` })
            }}
            className="text-xs text-slate-500 hover:text-danger-500"
          >
            Remove
          </button>
        </div>
      ))}
      {iface.prefixes.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add prefix'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="2001:db8::/64" className={inputClass} />
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
            <option value="">Default (static)</option>
            {NDP_PROXY_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {mode === 'interface' && (
            <input {...noExtensionInputProps} value={interfaceRef} onChange={(e) => setInterfaceRef(e.target.value)} placeholder="target interface" className={inputClass} />
          )}
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>
            Add prefix
          </button>
          {taken && <p className="col-span-3 text-xs text-danger-500">Already proxied.</p>}
        </div>
      )}
    </div>
  )
}
