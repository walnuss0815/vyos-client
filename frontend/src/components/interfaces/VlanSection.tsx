import { useState } from 'react'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import {
  blankVlanFormValues,
  vlanFormToOps,
  vlanToFormValues,
  type VlanFormValues,
} from '../../lib/interfaceConfigForm'
import { vlanPath } from '../../lib/interfaceParse'
import type { InterfaceVlan } from '../../lib/interfaceTypes'
import { usePendingChangesStore } from '../../store/pendingChanges'
import AddressChips from './AddressChips'

/**
 * VLAN (802.1q `vif`) sub-interface management for a single parent
 * Ethernet/Bonding/Bridge interface - shared across all three parent
 * types' pages, since the vif shape is identical regardless of what
 * it's nested under (see lib/interfaceTypes.ts's InterfaceVlan).
 */
export default function VlanSection({
  parentPath,
  parentPathLabel,
  vlans,
  vrfOptions,
}: {
  parentPath: string[]
  /** Human-readable dotted path prefix for pending-changes labels,
   * e.g. "interfaces ethernet eth0". */
  parentPathLabel: string
  vlans: InterfaceVlan[]
  vrfOptions: string[]
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingVlanId, setEditingVlanId] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(vlanId: string) {
    add({
      op: { op: 'delete', path: vlanPath(parentPath, vlanId) },
      label: `delete ${parentPathLabel} vif ${vlanId}`,
    })
  }

  const editing = editingVlanId ? vlans.find((v) => v.vlanId === editingVlanId) : undefined
  const existingIds = vlans.map((v) => v.vlanId)

  return (
    <div className="mt-4 border-t border-surface-border pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">VLANs (vif)</p>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingVlanId(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ Add VLAN'}
        </button>
      </div>

      {showCreate && (
        <VlanFormFields
          parentPath={parentPath}
          parentPathLabel={parentPathLabel}
          vrfOptions={vrfOptions}
          existingIds={existingIds}
          onDone={() => setShowCreate(false)}
        />
      )}
      {editing && (
        <VlanFormFields
          parentPath={parentPath}
          parentPathLabel={parentPathLabel}
          vrfOptions={vrfOptions}
          vlan={editing}
          existingIds={existingIds}
          onDone={() => setEditingVlanId(null)}
        />
      )}

      <div className="space-y-2">
        {vlans.map((vlan) => (
          <div key={vlan.vlanId} className="rounded-lg border border-surface-border bg-surface-800/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-medium text-white">
                  vif {vlan.vlanId}
                  {vlan.disabled && <span className="ml-1 text-slate-500">(disabled)</span>}
                </p>
                {vlan.description && <p className="text-xs text-slate-400">{vlan.description}</p>}
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {vlan.addresses.length > 0 ? vlan.addresses.join(', ') : 'No addresses'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingVlanId(vlan.vlanId)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(vlan.vlanId)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {vlans.length === 0 && <p className="text-xs text-slate-500">No VLAN sub-interfaces.</p>}
      </div>
    </div>
  )
}

function VlanFormFields({
  parentPath,
  parentPathLabel,
  vrfOptions,
  vlan,
  existingIds,
  onDone,
}: {
  parentPath: string[]
  parentPathLabel: string
  vrfOptions: string[]
  /** undefined = creating a new VLAN sub-interface. */
  vlan?: InterfaceVlan
  existingIds: string[]
  onDone: () => void
}) {
  const isCreate = vlan === undefined
  const [vlanId, setVlanId] = useState(vlan?.vlanId ?? '')
  const [initialAddress, setInitialAddress] = useState('')
  const [values, setValues] = useState<VlanFormValues>(vlan ? vlanToFormValues(vlan) : blankVlanFormValues())
  const add = usePendingChangesStore((s) => s.add)

  const idValid = /^\d+$/.test(vlanId) && Number(vlanId) >= 0 && Number(vlanId) <= 4094
  const idTaken = isCreate && existingIds.includes(vlanId)
  const canSubmit = idValid && !idTaken

  function update<K extends keyof VlanFormValues>(key: K, value: VlanFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const path = vlanPath(parentPath, vlanId)
    const ops = vlanFormToOps(parentPath, vlanId, vlan, values)
    for (const op of ops) {
      const field = op.path[op.path.length - 1]
      add({ op, label: `${op.op} ${parentPathLabel} vif ${vlanId} ${field}${op.value ? ` '${op.value}'` : ''}` })
    }
    if (isCreate && initialAddress.trim()) {
      add({
        op: { op: 'set', path: [...path, 'address'], value: initialAddress.trim() },
        label: `set ${parentPathLabel} vif ${vlanId} address '${initialAddress.trim()}'`,
      })
    }
    onDone()
  }

  return (
    <div className="mb-3 rounded-lg border border-surface-border bg-surface-900 p-3">
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          VLAN ID
          <input
            {...noExtensionInputProps}
            disabled={!isCreate}
            autoFocus={isCreate}
            value={vlanId}
            onChange={(e) => setVlanId(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="10"
            className={`${inputClass} disabled:opacity-60`}
          />
          {idTaken && <span className="text-danger-500">VLAN {vlanId} already exists.</span>}
        </label>
        <label className={labelClass}>
          Description
          <input
            {...noExtensionInputProps}
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
        {isCreate && (
          <label className={labelClass}>
            Initial address (optional)
            <input
              {...noExtensionInputProps}
              value={initialAddress}
              onChange={(e) => setInitialAddress(e.target.value)}
              placeholder="192.0.2.1/24, dhcp, or dhcpv6"
              className={inputClass}
            />
          </label>
        )}
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.disabled}
            onChange={(e) => update('disabled', e.target.checked)}
            className="accent-accent-500"
          />
          Disable this VLAN interface
        </label>
      </div>

      {!isCreate && vlan && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">Addresses</p>
          <AddressChips
            addresses={vlan.addresses}
            basePath={vlanPath(parentPath, vlanId)}
            pathLabel={`${parentPathLabel} vif ${vlanId} address`}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue new VLAN' : 'Queue changes'}
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
