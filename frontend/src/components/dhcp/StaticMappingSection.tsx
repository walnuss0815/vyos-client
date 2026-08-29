import { useState } from 'react'
import {
  blankStaticMappingFormValues,
  staticMappingFormToOps,
  staticMappingToFormValues,
  type StaticMappingFormValues,
} from '../../lib/dhcpConfigForm'
import { staticMappingPath } from '../../lib/dhcpConfigParse'
import type { DHCPRange, DHCPStaticMapping } from '../../lib/dhcpConfigTypes'
import { isAddressInDynamicRange } from '../../lib/dhcpPoolUtilization'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { isValidIpv4 } from '../../lib/ipv4'
import { isValidVyOSIdentifier } from '../../lib/vyosIdentifier'
import { usePendingChangesStore } from '../../store/pendingChanges'

/**
 * Full static-mapping (DHCP reservation) CRUD for a subnet -
 * independent of any current lease, unlike DHCPLeasesTable's "Make
 * static" quick action (which stays on the Leases tab for the common
 * one-click case). Both write the exact same config shape
 * (`static-mapping <name> { mac/duid ..., ip-address ... }`), just
 * from different starting points.
 *
 * `ranges`/`excludes` (the subnet's own dynamic-range fields, already
 * available to SubnetCard.tsx) are optional and only used for the IP
 * field's dynamic-range-collision warning - see MakeStaticModal.tsx's
 * identical check, shared via isAddressInDynamicRange.
 */
export default function StaticMappingSection({
  networkName,
  cidr,
  mappings,
  ranges = [],
  excludes = [],
}: {
  networkName: string
  cidr: string
  mappings: DHCPStaticMapping[]
  ranges?: DHCPRange[]
  excludes?: string[]
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    add({
      op: { op: 'delete', path: staticMappingPath(networkName, cidr, name) },
      label: `delete ... static-mapping ${name}`,
    })
  }

  const editing = editingName ? mappings.find((m) => m.name === editingName) : undefined
  const existingNames = mappings.map((m) => m.name)

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-slate-500">Static mappings</p>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ Add mapping'}
        </button>
      </div>

      {showCreate && (
        <MappingFormFields
          networkName={networkName}
          cidr={cidr}
          ranges={ranges}
          excludes={excludes}
          existingNames={existingNames}
          onDone={() => setShowCreate(false)}
        />
      )}
      {editing && (
        <MappingFormFields
          networkName={networkName}
          cidr={cidr}
          mapping={editing}
          ranges={ranges}
          excludes={excludes}
          existingNames={existingNames}
          onDone={() => setEditingName(null)}
        />
      )}

      <div className="space-y-1">
        {mappings.map((m) => (
          <div
            key={m.name}
            className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-800 px-2 py-1 text-xs"
          >
            <div>
              <span className="font-mono text-slate-300">{m.name}</span>
              {m.ipAddress && <span className="ml-2 font-mono text-slate-500">{m.ipAddress}</span>}
              {m.mac && <span className="ml-2 font-mono text-slate-500">{m.mac}</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingName(m.name)
                  setShowCreate(false)
                }}
                className="text-accent-500 hover:text-accent-400"
              >
                Edit
              </button>
              <button onClick={() => queueDelete(m.name)} className="text-slate-500 hover:text-danger-500">
                Delete
              </button>
            </div>
          </div>
        ))}
        {mappings.length === 0 && <p className="text-xs text-slate-500">No static mappings.</p>}
      </div>
    </div>
  )
}

function MappingFormFields({
  networkName,
  cidr,
  mapping,
  ranges,
  excludes,
  existingNames,
  onDone,
}: {
  networkName: string
  cidr: string
  /** undefined = creating a new static mapping. */
  mapping?: DHCPStaticMapping
  ranges: DHCPRange[]
  excludes: string[]
  existingNames: string[]
  onDone: () => void
}) {
  const isCreate = mapping === undefined
  const [name, setName] = useState(mapping?.name ?? '')
  const [values, setValues] = useState<StaticMappingFormValues>(
    mapping ? staticMappingToFormValues(mapping) : blankStaticMappingFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  // VyOS needs at least one client identifier (MAC or DUID) to match
  // the host the reservation applies to.
  const hasIdentifier = values.mac.trim() !== '' || values.duid.trim() !== ''
  // The IP address is optional (VyOS falls back to the dynamic pool if
  // unset) - only reject a non-empty value that isn't a well-formed
  // IPv4 address.
  const trimmedIp = values.ipAddress.trim()
  const ipValid = trimmedIp === '' || isValidIpv4(trimmedIp)
  const inDynamicRange = isAddressInDynamicRange(trimmedIp, { ranges, excludes })
  const canSubmit = isValidVyOSIdentifier(trimmedName) && !nameTaken && hasIdentifier && ipValid

  function update<K extends keyof StaticMappingFormValues>(key: K, value: StaticMappingFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = staticMappingFormToOps(networkName, cidr, trimmedName, mapping, values)
    for (const op of ops) {
      const field = op.path[op.path.length - 1]
      add({ op, label: `${op.op} ... static-mapping ${trimmedName} ${field}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="mb-3 rounded-lg border border-surface-border bg-surface-900 p-3">
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Name
          <input
            {...noExtensionInputProps}
            disabled={!isCreate}
            autoFocus={isCreate}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="client1"
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">mapping {trimmedName} already exists.</span>}
        </label>
        <label className={labelClass}>
          IP address
          <input
            {...noExtensionInputProps}
            value={values.ipAddress}
            onChange={(e) => update('ipAddress', e.target.value)}
            placeholder="192.168.1.100 (optional - uses the dynamic pool if unset)"
            className={inputClass}
          />
          {!ipValid && <span className="text-danger-500">Not a valid IPv4 address.</span>}
          {ipValid && inDynamicRange && (
            <span className="text-amber-500">
              Falls inside this subnet's own dynamic range - could collide with a
              dynamically-leased client.
            </span>
          )}
        </label>
        <label className={labelClass}>
          MAC address
          <input
            {...noExtensionInputProps}
            value={values.mac}
            onChange={(e) => update('mac', e.target.value)}
            placeholder="aa:bb:cc:dd:ee:ff"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          DUID
          <input
            {...noExtensionInputProps}
            value={values.duid}
            onChange={(e) => update('duid', e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {!hasIdentifier && (
        <p className="mt-2 text-xs text-danger-500">A MAC address or DUID is required.</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue new mapping' : 'Queue changes'}
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
