import { useState } from 'react'
import {
  addVRRPGroupAddressOps,
  blankVRRPGroupFormValues,
  deleteVRRPGroupOp,
  removeVRRPGroupAddressOp,
  vrrpGroupFormToOps,
  vrrpGroupToFormValues,
  type VRRPGroupFormValues,
} from '../../lib/haVrrpForm'
import { vrrpGroupPath } from '../../lib/haParse'
import type { VRRPGroup } from '../../lib/haTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ChipList from '../ChipList'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

/** `vrrp group <name>` list - the core VRRP unit: one interface, one
 * virtual router ID, one or more virtual addresses. Each group's
 * `address`/`excluded-address` lists are nested add/remove sections
 * (VrrpAddressesSection below); `peer-address`/`track interface` are
 * plain multi-valued leaves reusing ChipList.tsx directly. */
export default function VrrpGroupList({ groups }: { groups: VRRPGroup[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = groups.map((g) => g.name)

  function queueDelete(name: string) {
    add({ op: deleteVRRPGroupOp(name), label: `delete high-availability vrrp group ${name}` })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Groups</p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditing(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add group'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-surface-border bg-surface-900 p-4">
          {/* Name lives inside VrrpGroupFormPanel itself (not gating
           * this panel's existence on it) so clearing it mid-fill
           * doesn't unmount the panel and discard every other field
           * already filled in - see HaproxyServiceList's equivalent
           * comment for the full rationale. */}
          <VrrpGroupFormPanel existingNames={existingNames} onDone={() => setShowAdd(false)} />
        </div>
      )}

      {groups.length === 0 && !showAdd && <p className="text-xs text-slate-500">No VRRP groups configured yet.</p>}

      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            {editing === group.name ? (
              <VrrpGroupFormPanel existingNames={existingNames} group={group} onDone={() => setEditing(null)} />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-white">
                    {group.name}
                    {group.disabled && <span className="ml-2 text-xs text-slate-500">(disabled)</span>}
                  </span>
                  <div>
                    <button
                      onClick={() => {
                        setEditing(group.name)
                        setShowAdd(false)
                      }}
                      className="text-xs text-accent-500 hover:text-accent-400"
                    >
                      Edit
                    </button>{' '}
                    <button
                      onClick={() => queueDelete(group.name)}
                      className="ml-2 text-xs text-slate-500 hover:text-danger-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  {group.interface ?? '—'} · vrid {group.vrid ?? '—'} · priority {group.priority}
                  {group.rfc3768Compatibility && ' · RFC3768'}
                </p>
                {group.description && <p className="text-xs text-slate-400">{group.description}</p>}

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <VrrpAddressesSection group={group} leaf="address" title="Virtual addresses" />
                  <VrrpAddressesSection group={group} leaf="excluded-address" title="Excluded addresses" />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ChipList
                    values={group.peerAddresses}
                    basePath={vrrpGroupPath(group.name)}
                    leaf="peer-address"
                    pathLabel={`... group ${group.name} peer-address`}
                    placeholder="unicast peer address"
                  />
                  <FieldLabel label="Tracked interfaces" hint="Link-down on any of these puts this group into FAULT state.">
                    <ChipList
                      values={group.trackInterfaces}
                      basePath={[...vrrpGroupPath(group.name), 'track']}
                      leaf="interface"
                      pathLabel={`... group ${group.name} track interface`}
                      placeholder="eth1"
                    />
                  </FieldLabel>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function VrrpGroupFormPanel({
  group,
  existingNames,
  onDone,
}: {
  group?: VRRPGroup
  existingNames: string[]
  onDone: () => void
}) {
  const add = usePendingChangesStore((s) => s.add)
  const isCreate = group === undefined
  const [newName, setNewName] = useState('')
  const [values, setValues] = useState<VRRPGroupFormValues>(
    group ? vrrpGroupToFormValues(group) : blankVRRPGroupFormValues(),
  )
  const [firstAddress, setFirstAddress] = useState('')
  const [firstAddressInterface, setFirstAddressInterface] = useState('')

  const name = isCreate ? newName.trim() : group.name
  const nameTaken = isCreate && existingNames.includes(name)
  const nameValid = !isCreate || (name !== '' && !nameTaken)

  function update<K extends keyof VRRPGroupFormValues>(key: K, value: VRRPGroupFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!nameValid) return
    const ops = vrrpGroupFormToOps(name, group, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    // A group's virtual addresses used to only be configurable AFTER
    // the group already existed - VrrpAddressesSection only ever
    // operates on an already-fetched group. Queuing a first one here,
    // in the same commit as the group itself, avoids a detour
    // through commit+refetch.
    if (isCreate && firstAddress.trim()) {
      const addressOps = addVRRPGroupAddressOps(name, 'address', firstAddress.trim(), firstAddressInterface.trim())
      for (const op of addressOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div>
      {isCreate && (
        <label className={`${labelClass} mb-3`}>
          Name
          <input
            {...noExtensionInputProps}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="OUTSIDE"
            className={`font-mono ${inputClass}`}
          />
          {nameTaken && <span className="text-danger-500">A group named "{name}" already exists.</span>}
        </label>
      )}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className={labelClass}>
          Interface
          <input
            {...noExtensionInputProps}
            value={values.interface}
            onChange={(e) => update('interface', e.target.value)}
            placeholder="eth0"
            className={`font-mono ${inputClass}`}
          />
        </label>
        <label className={labelClass}>
          VRID
          <input
            {...noExtensionInputProps}
            value={values.vrid}
            onChange={(e) => update('vrid', e.target.value)}
            placeholder="1-255"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Priority
          <input
            {...noExtensionInputProps}
            value={values.priority}
            onChange={(e) => update('priority', e.target.value)}
            placeholder="100"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Advertise interval (seconds)
          <input
            {...noExtensionInputProps}
            value={values.advertiseInterval}
            onChange={(e) => update('advertiseInterval', e.target.value)}
            placeholder="1"
            className={inputClass}
          />
        </label>
      </div>

      <label className={`${labelClass} mb-3`}>
        Description
        <input
          {...noExtensionInputProps}
          value={values.description}
          onChange={(e) => update('description', e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="mb-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.disabled}
            onChange={(e) => update('disabled', e.target.checked)}
            className="accent-accent-500"
          />
          Disabled
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.noPreempt}
            onChange={(e) => update('noPreempt', e.target.checked)}
            className="accent-accent-500"
          />
          Disable preemption
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.rfc3768Compatibility}
            onChange={(e) => update('rfc3768Compatibility', e.target.checked)}
            className="accent-accent-500"
          />
          RFC3768 virtual MAC
          <InfoTooltip text="Creates a dedicated virtual interface (e.g. eth0v10) with the standard VRRP virtual MAC address, instead of assigning the virtual address directly to the real interface." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.excludeVrrpInterface}
            onChange={(e) => update('excludeVrrpInterface', e.target.checked)}
            className="accent-accent-500"
          />
          Don't track this group's own interface
        </label>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className={labelClass}>
          Preempt delay (seconds)
          <input
            {...noExtensionInputProps}
            value={values.preemptDelay}
            onChange={(e) => update('preemptDelay', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Hello source address (optional)
          <input
            {...noExtensionInputProps}
            value={values.helloSourceAddress}
            onChange={(e) => update('helloSourceAddress', e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Authentication (optional)</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            {...noExtensionInputProps}
            value={values.authenticationPassword}
            onChange={(e) => update('authenticationPassword', e.target.value)}
            placeholder="password (up to 8 chars)"
            className={inputClass}
          />
          <select
            value={values.authenticationType}
            onChange={(e) => update('authenticationType', e.target.value)}
            className={inputClass}
          >
            <option value="">(none)</option>
            <option value="plaintext-password">plaintext-password</option>
            <option value="ah">ah</option>
          </select>
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Health check (optional - ping or script, not both)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            {...noExtensionInputProps}
            value={values.healthCheckPing}
            onChange={(e) => update('healthCheckPing', e.target.value)}
            placeholder="ping target"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.healthCheckScript}
            onChange={(e) => update('healthCheckScript', e.target.value)}
            placeholder="or script path"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={values.healthCheckFailureCount}
            onChange={(e) => update('healthCheckFailureCount', e.target.value)}
            placeholder="failure count (3)"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.healthCheckInterval}
            onChange={(e) => update('healthCheckInterval', e.target.value)}
            placeholder="interval sec (60)"
            className={inputClass}
          />
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Transition scripts (optional)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            {...noExtensionInputProps}
            value={values.transitionMaster}
            onChange={(e) => update('transitionMaster', e.target.value)}
            placeholder="master"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={values.transitionBackup}
            onChange={(e) => update('transitionBackup', e.target.value)}
            placeholder="backup"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={values.transitionFault}
            onChange={(e) => update('transitionFault', e.target.value)}
            placeholder="fault"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={values.transitionStop}
            onChange={(e) => update('transitionStop', e.target.value)}
            placeholder="stop"
            className={`font-mono ${inputClass}`}
          />
        </div>
      </div>

      {isCreate && (
        <div className="mb-3 border-t border-surface-border pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">First virtual address (optional)</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              {...noExtensionInputProps}
              value={firstAddress}
              onChange={(e) => setFirstAddress(e.target.value)}
              placeholder="192.0.2.254/24"
              className={`font-mono ${inputClass}`}
            />
            <input
              {...noExtensionInputProps}
              value={firstAddressInterface}
              onChange={(e) => setFirstAddressInterface(e.target.value)}
              placeholder="assign to a different interface (optional)"
              className={`font-mono ${inputClass}`}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={!nameValid} className={`bg-accent-600 ${buttonClass}`}>
          {group ? 'Save' : 'Add group'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  )
}

function VrrpAddressesSection({
  group,
  leaf,
  title,
}: {
  group: VRRPGroup
  leaf: 'address' | 'excluded-address'
  title: string
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [iface, setIface] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const items = leaf === 'address' ? group.addresses : group.excludedAddresses
  const trimmed = address.trim()
  const taken = items.some((a) => a.address === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addVRRPGroupAddressOps(group.name, leaf, trimmed, iface)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setIface('')
    setShowAdd(false)
  }

  function queueRemove(a: string) {
    const op = removeVRRPGroupAddressOp(group.name, leaf, a)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{title}</p>
      {items.map((item) => (
        <div key={item.address} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {item.address}
            {item.interface && ` (on ${item.interface})`}
          </span>
          <button onClick={() => queueRemove(item.address)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add address'}
      </button>
      {showAdd && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            {...noExtensionInputProps}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="192.0.2.254/24"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={iface}
            onChange={(e) => setIface(e.target.value)}
            placeholder="assign to a different interface (optional)"
            className={`font-mono ${inputClass}`}
          />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="text-xs text-danger-500">This address is already listed.</p>}
        </div>
      )}
    </div>
  )
}
