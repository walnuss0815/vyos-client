import { useState } from 'react'
import Modal from '../Modal'
import {
  blankStaticMappingFormValues,
  staticMappingFormToOps,
  staticMappingToFormValues,
  type StaticMappingFormValues,
} from '../../lib/dhcpConfigForm'
import type { DHCPStaticMapping, DHCPSubnet } from '../../lib/dhcpConfigTypes'
import { isAddressInDynamicRange } from '../../lib/dhcpPoolUtilization'
import { suggestStaticMappingName } from '../../lib/dhcpLeases'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { isValidIpv4 } from '../../lib/ipv4'
import { isValidVyOSIdentifier } from '../../lib/vyosIdentifier'
import type { DHCPLease } from '../../lib/vyosApi'
import { usePendingChangesStore } from '../../store/pendingChanges'

/**
 * "Make static" confirmation for a single DHCP lease
 * (DHCPLeasesTable.tsx), pre-filled from the lease (suggested name,
 * MAC, IP address) but fully editable before queuing - unlike the
 * previous behavior (an immediate, non-editable queue on click), this
 * gives a chance to fix a bad suggested name or adjust the address
 * before it's added to the pending-changes cart. DUID is left blank
 * (leases don't carry one); either MAC or DUID satisfies VyOS's
 * "needs a client identifier" requirement, same as
 * StaticMappingSection.tsx's own create form, whose exact op-building
 * logic (staticMappingFormToOps) this reuses.
 *
 * Also doubles as the edit form for a lease that's already statically
 * reserved (`mapping` given - see DHCPLeasesTable.tsx's "Edit" vs.
 * "Make static" branching, and dhcpLeases.ts's findStaticMapping for
 * how that's detected): the name field becomes read-only (same
 * restriction StaticMappingSection.tsx's own edit form has - VyOS
 * tagNode identifiers aren't renamed in place, only deleted/recreated)
 * and submitting diffs against the existing mapping instead of
 * creating a new one.
 */
export default function MakeStaticModal({
  lease,
  mapping,
  subnet,
  existingNames,
  onDone,
}: {
  lease: DHCPLease
  /** The existing static mapping this lease already corresponds to -
   * if given, this modal edits it instead of creating a new one. */
  mapping?: DHCPStaticMapping
  /** The subnet this lease/mapping belongs to, if it could be
   * resolved (see dhcpLeases.ts's subnetForLease) - used only for the
   * dynamic-range-collision warning below; every other field this
   * component needs comes from `lease`/`mapping` directly. */
  subnet?: DHCPSubnet
  existingNames: string[]
  onDone: () => void
}) {
  const isEdit = mapping !== undefined
  const [name, setName] = useState(mapping?.name ?? suggestStaticMappingName(lease))
  const [values, setValues] = useState<StaticMappingFormValues>(
    mapping
      ? staticMappingToFormValues(mapping)
      : { ...blankStaticMappingFormValues(), mac: lease.macAddress, ipAddress: lease.ipAddress },
  )
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const nameTaken = !isEdit && existingNames.includes(trimmedName)
  const hasIdentifier = values.mac.trim() !== '' || values.duid.trim() !== ''
  // The IP address is optional (VyOS falls back to the dynamic pool if
  // unset, same as StaticMappingSection.tsx's own create form) - only
  // reject a non-empty value that isn't a well-formed IPv4 address.
  const trimmedIp = values.ipAddress.trim()
  const ipValid = trimmedIp === '' || isValidIpv4(trimmedIp)
  const inDynamicRange = subnet ? isAddressInDynamicRange(trimmedIp, subnet) : false
  const canSubmit =
    isValidVyOSIdentifier(trimmedName) && !nameTaken && hasIdentifier && ipValid && !!lease.subnet

  function update<K extends keyof StaticMappingFormValues>(key: K, value: StaticMappingFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit || !lease.subnet) return
    const ops = staticMappingFormToOps(lease.pool, lease.subnet, trimmedName, mapping, values)
    for (const op of ops) {
      const field = op.path[op.path.length - 1]
      add({ op, label: `${op.op} ... static-mapping ${trimmedName} ${field}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <Modal
      title={isEdit ? 'Edit static mapping' : 'Make static mapping'}
      onClose={onDone}
      footer={
        <>
          <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
            {isEdit ? 'Save changes' : 'Queue mapping'}
          </button>
          <button
            onClick={onDone}
            className="rounded border border-surface-border px-2 py-1 text-xs text-slate-300 hover:bg-surface-800"
          >
            Cancel
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        {isEdit
          ? 'Edits the static mapping this lease is already reserved under'
          : "Reserves this lease's address as a permanent static mapping under"}{' '}
        <span className="font-mono text-slate-300">
          {lease.pool} / {lease.subnet}
        </span>
        . The device won't actually start using a new address here until it renews its lease
        (reconnecting or rebooting the device forces this) - VyOS doesn't renegotiate an
        already-active lease on its own.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Name
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={isEdit}
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          DUID
          <input
            {...noExtensionInputProps}
            value={values.duid}
            onChange={(e) => update('duid', e.target.value)}
            placeholder="(optional)"
            className={inputClass}
          />
        </label>
      </div>
      {!hasIdentifier && <p className="mt-2 text-xs text-danger-500">A MAC address or DUID is required.</p>}
    </Modal>
  )
}
