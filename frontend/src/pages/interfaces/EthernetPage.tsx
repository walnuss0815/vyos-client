import { useState } from 'react'
import AddressChips from '../../components/interfaces/AddressChips'
import VlanSection from '../../components/interfaces/VlanSection'
import { useInterfaceConfig } from '../../hooks/useInterfaceConfig'
import { useInterfaces } from '../../hooks/useInterfaces'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import {
  ethernetFormToOps,
  ethernetToFormValues,
  type EthernetFormValues,
} from '../../lib/interfaceConfigForm'
import { isEthernetInterface, isVlanInterface } from '../../lib/interfaceType'
import { ethernetPath } from '../../lib/interfaceParse'
import type { EthernetInterface } from '../../lib/interfaceTypes'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

function blankEthernet(name: string): EthernetInterface {
  return { name, disabled: false, addresses: [], vlans: [] }
}

/**
 * Ethernet interfaces are physical - this page never lets you "create"
 * one, only configure interfaces the router's kernel already reports
 * (useInterfaces, the same operational data the Live State tab and
 * Dashboard use), cross-referenced with whatever config already exists
 * for each (useInterfaceConfig). An interface with no config yet still
 * gets a card, with every field blank/default.
 */
export default function EthernetPage() {
  const interfacesQuery = useInterfaces()
  const { ethernetInterfaces, vrfs, isLoading, isError } = useInterfaceConfig()

  const physicalNames = (interfacesQuery.data ?? [])
    .map((i) => i.name)
    .filter((name) => isEthernetInterface(name) && !isVlanInterface(name))

  const merged = physicalNames
    .map((name) => ethernetInterfaces.find((e) => e.name === name) ?? blankEthernet(name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const loading = isLoading || interfacesQuery.isLoading
  const errored = isError || interfacesQuery.isError
  const vrfOptions = vrfs.map((v) => v.name)

  return (
    <div>
      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {errored && <p className="text-sm text-danger-500">Failed to load interface configuration.</p>}

      <div className="space-y-3">
        {merged.map((iface) => (
          <EthernetCard key={iface.name} iface={iface} vrfOptions={vrfOptions} />
        ))}
        {!loading && merged.length === 0 && (
          <p className="text-sm text-slate-500">No Ethernet interfaces detected on this router.</p>
        )}
      </div>
    </div>
  )
}

function EthernetCard({ iface, vrfOptions }: { iface: EthernetInterface; vrfOptions: string[] }) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-sm font-medium text-white">
            {iface.name}
            {iface.disabled && <span className="ml-2 text-xs text-slate-500">(disabled)</span>}
          </h3>
          {iface.description && <p className="mt-0.5 text-xs text-slate-400">{iface.description}</p>}
        </div>
        <button onClick={() => setEditing((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <EthernetEditForm iface={iface} vrfOptions={vrfOptions} onDone={() => setEditing(false)} />
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">MAC</dt>
            <dd className="font-mono text-slate-300">{iface.mac || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">MTU</dt>
            <dd className="font-mono text-slate-300">{iface.mtu ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">VRF</dt>
            <dd className="font-mono text-slate-300">{iface.vrf || '—'}</dd>
          </div>
        </dl>
      )}

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">Addresses</p>
        <AddressChips
          addresses={iface.addresses}
          basePath={ethernetPath(iface.name)}
          pathLabel={`interfaces ethernet ${iface.name} address`}
        />
      </div>

      <VlanSection
        parentPath={ethernetPath(iface.name)}
        parentPathLabel={`interfaces ethernet ${iface.name}`}
        vlans={iface.vlans}
        vrfOptions={vrfOptions}
      />
    </div>
  )
}

function EthernetEditForm({
  iface,
  vrfOptions,
  onDone,
}: {
  iface: EthernetInterface
  vrfOptions: string[]
  onDone: () => void
}) {
  const [values, setValues] = useState<EthernetFormValues>(ethernetToFormValues(iface))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof EthernetFormValues>(key: K, value: EthernetFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = ethernetFormToOps(iface.name, iface, values)
    for (const op of ops) {
      const field = op.path[op.path.length - 1]
      add({
        op,
        label: `${op.op} interfaces ethernet ${iface.name} ${field}${op.value ? ` '${op.value}'` : ''}`,
      })
    }
    onDone()
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <label className={labelClass}>
        Description
        <input
          {...noExtensionInputProps}
          autoFocus
          value={values.description}
          onChange={(e) => update('description', e.target.value)}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        MAC address
        <input
          {...noExtensionInputProps}
          value={values.mac}
          onChange={(e) => update('mac', e.target.value)}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        MTU
        <input
          {...noExtensionInputProps}
          value={values.mtu}
          onChange={(e) => update('mtu', e.target.value.replace(/[^0-9]/g, ''))}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        VRF
        <select value={values.vrf} onChange={(e) => update('vrf', e.target.value)} className={inputClass}>
          <option value="">(none)</option>
          {vrfOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={values.disabled}
          onChange={(e) => update('disabled', e.target.checked)}
          className="accent-accent-500"
        />
        Disable this interface
      </label>

      <div className="col-span-2 flex items-center gap-2">
        <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
          Queue changes
        </button>
        <button
          onClick={onDone}
          className="rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:bg-surface-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
