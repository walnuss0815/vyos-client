import { useState } from 'react'
import AddressChips from '../../components/interfaces/AddressChips'
import VlanSection from '../../components/interfaces/VlanSection'
import { useInterfaceConfig } from '../../hooks/useInterfaceConfig'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import {
  bridgeFormToOps,
  bridgeToFormValues,
  type BridgeFormValues,
} from '../../lib/interfaceConfigForm'
import { bridgePath } from '../../lib/interfaceParse'
import { BRIDGE_VLAN_PROTOCOLS, type BridgeInterface, type BridgeMember } from '../../lib/interfaceTypes'
import { isValidVyOSIdentifier } from '../../lib/vyosIdentifier'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function BridgePage() {
  const { bridgeInterfaces, vrfs, isLoading, isError } = useInterfaceConfig()
  const [showCreate, setShowCreate] = useState(false)
  const vrfOptions = vrfs.map((v) => v.name)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          A bridge joins multiple interfaces into one Layer 2 broadcast domain.
        </p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New bridge'}
        </button>
      </div>

      {showCreate && (
        <CreateBridgeForm
          existingNames={bridgeInterfaces.map((b) => b.name)}
          onDone={() => setShowCreate(false)}
        />
      )}

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load interface configuration.</p>}

      <div className="space-y-3">
        {bridgeInterfaces.map((bridge) => (
          <BridgeCard key={bridge.name} bridge={bridge} vrfOptions={vrfOptions} />
        ))}
        {!isLoading && bridgeInterfaces.length === 0 && (
          <p className="text-sm text-slate-500">No bridges configured yet.</p>
        )}
      </div>
    </div>
  )
}

function CreateBridgeForm({ existingNames, onDone }: { existingNames: string[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [firstMember, setFirstMember] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const nameTaken = existingNames.includes(trimmedName)
  const valid = isValidVyOSIdentifier(trimmedName) && !nameTaken && firstMember.trim() !== ''

  function submit() {
    if (!valid) return
    const member = firstMember.trim()
    add({
      op: { op: 'set', path: bridgePath(trimmedName, 'member', 'interface', member) },
      label: `set interfaces bridge ${trimmedName} member interface ${member}`,
    })
    onDone()
  }

  return (
    <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
      <label className={labelClass}>
        Name
        <input
          {...noExtensionInputProps}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="br0"
          className={inputClass}
        />
        {nameTaken && <span className="text-danger-500">bridge {trimmedName} already exists.</span>}
      </label>
      <label className={`mt-3 ${labelClass}`}>
        First member interface
        <input
          {...noExtensionInputProps}
          value={firstMember}
          onChange={(e) => setFirstMember(e.target.value)}
          placeholder="eth1"
          className={inputClass}
        />
      </label>
      <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Queue bridge creation
      </button>
    </div>
  )
}

function BridgeCard({ bridge, vrfOptions }: { bridge: BridgeInterface; vrfOptions: string[] }) {
  const [editing, setEditing] = useState(false)
  const [newMember, setNewMember] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete() {
    add({ op: { op: 'delete', path: bridgePath(bridge.name) }, label: `delete interfaces bridge ${bridge.name}` })
  }

  function queueAddMember() {
    if (!newMember.trim()) return
    const member = newMember.trim()
    add({
      op: { op: 'set', path: bridgePath(bridge.name, 'member', 'interface', member) },
      label: `set interfaces bridge ${bridge.name} member interface ${member}`,
    })
    setNewMember('')
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-sm font-medium text-white">
            {bridge.name}
            {bridge.disabled && <span className="ml-2 text-xs text-slate-500">(disabled)</span>}
          </h3>
          {bridge.description && <p className="mt-0.5 text-xs text-slate-400">{bridge.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <button onClick={() => setEditing((v) => !v)} className="text-accent-500 hover:text-accent-400">
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={queueDelete} className="text-slate-500 hover:text-danger-500">
            Delete bridge
          </button>
        </div>
      </div>

      {editing ? (
        <BridgeEditForm bridge={bridge} vrfOptions={vrfOptions} onDone={() => setEditing(false)} />
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">STP</dt>
            <dd className="font-mono text-slate-300">{bridge.stp ? 'on' : 'off'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">VLAN-aware</dt>
            <dd className="font-mono text-slate-300">
              {bridge.vlanAware ? (bridge.vlanProtocol ?? '802.1q') : 'off'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">MTU</dt>
            <dd className="font-mono text-slate-300">{bridge.mtu ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">VRF</dt>
            <dd className="font-mono text-slate-300">{bridge.vrf || '—'}</dd>
          </div>
        </dl>
      )}

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">Member interfaces</p>
        <div className="space-y-1.5">
          {bridge.members.map((member) => (
            <MemberRow key={member.name} bridgeName={bridge.name} member={member} />
          ))}
          {bridge.members.length === 0 && <p className="text-xs text-slate-500">No member interfaces.</p>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            {...noExtensionInputProps}
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            placeholder="eth2"
            className={inputClass}
          />
          <button onClick={queueAddMember} disabled={!newMember.trim()} className={`bg-accent-600 ${buttonClass}`}>
            Add member
          </button>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">Addresses</p>
        <AddressChips
          addresses={bridge.addresses}
          basePath={bridgePath(bridge.name)}
          pathLabel={`interfaces bridge ${bridge.name} address`}
        />
      </div>

      <VlanSection
        parentPath={bridgePath(bridge.name)}
        parentPathLabel={`interfaces bridge ${bridge.name}`}
        vlans={bridge.vlans}
        vrfOptions={vrfOptions}
      />
    </div>
  )
}

/** A single bridge member row - name plus its STP priority/cost,
 * queued immediately on blur (not batched behind a Save button, same
 * as every other small always-visible control on these cards). */
function MemberRow({ bridgeName, member }: { bridgeName: string; member: BridgeMember }) {
  const add = usePendingChangesStore((s) => s.add)
  const basePath = bridgePath(bridgeName, 'member', 'interface', member.name)

  function queueRemove() {
    add({
      op: { op: 'delete', path: basePath },
      label: `delete interfaces bridge ${bridgeName} member interface ${member.name}`,
    })
  }

  function queueField(field: 'priority' | 'cost', raw: string) {
    const value = raw.trim()
    const path = [...basePath, field]
    if (value === '') {
      add({
        op: { op: 'delete', path },
        label: `delete interfaces bridge ${bridgeName} member interface ${member.name} ${field}`,
      })
    } else {
      add({
        op: { op: 'set', path, value },
        label: `set interfaces bridge ${bridgeName} member interface ${member.name} ${field} '${value}'`,
      })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded bg-surface-800 px-2 py-1 text-xs">
      <span className="font-mono text-slate-300">{member.name}</span>
      <label className="flex items-center gap-1 text-slate-500">
        priority
        <input
          {...noExtensionInputProps}
          type="text"
          inputMode="numeric"
          defaultValue={member.priority ?? ''}
          onBlur={(e) => queueField('priority', e.target.value.replace(/[^0-9]/g, ''))}
          className="w-14 rounded border border-surface-border bg-surface-900 px-1.5 py-0.5 font-mono text-slate-200 outline-none focus:border-accent-500"
        />
      </label>
      <label className="flex items-center gap-1 text-slate-500">
        cost
        <input
          {...noExtensionInputProps}
          type="text"
          inputMode="numeric"
          defaultValue={member.cost ?? ''}
          onBlur={(e) => queueField('cost', e.target.value.replace(/[^0-9]/g, ''))}
          className="w-16 rounded border border-surface-border bg-surface-900 px-1.5 py-0.5 font-mono text-slate-200 outline-none focus:border-accent-500"
        />
      </label>
      <button
        onClick={queueRemove}
        className="ml-auto text-slate-500 hover:text-danger-500"
        aria-label={`Remove member ${member.name} from bridge ${bridgeName}`}
      >
        ✕
      </button>
    </div>
  )
}

function BridgeEditForm({
  bridge,
  vrfOptions,
  onDone,
}: {
  bridge: BridgeInterface
  vrfOptions: string[]
  onDone: () => void
}) {
  const [values, setValues] = useState<BridgeFormValues>(bridgeToFormValues(bridge))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof BridgeFormValues>(key: K, value: BridgeFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = bridgeFormToOps(bridge.name, bridge, values)
    for (const op of ops) {
      const field = op.path[op.path.length - 1]
      add({
        op,
        label: `${op.op} interfaces bridge ${bridge.name} ${field}${op.value ? ` '${op.value}'` : ''}`,
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
      <label className={labelClass}>
        VLAN protocol
        <select
          value={values.vlanProtocol}
          onChange={(e) => update('vlanProtocol', e.target.value as BridgeFormValues['vlanProtocol'])}
          disabled={!values.vlanAware}
          className={`${inputClass} disabled:opacity-50`}
        >
          <option value="">(default: 802.1q)</option>
          {BRIDGE_VLAN_PROTOCOLS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.stp}
            onChange={(e) => update('stp', e.target.checked)}
            className="accent-accent-500"
          />
          Enable STP
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.vlanAware}
            onChange={(e) => update('vlanAware', e.target.checked)}
            className="accent-accent-500"
          />
          VLAN-aware
        </label>
      </div>
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
