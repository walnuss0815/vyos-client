import { useState } from 'react'
import AddressChips from '../../components/interfaces/AddressChips'
import VlanSection from '../../components/interfaces/VlanSection'
import { useInterfaceConfig } from '../../hooks/useInterfaceConfig'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import {
  bondFormToOps,
  bondToFormValues,
  type BondFormValues,
} from '../../lib/interfaceConfigForm'
import { bondPath } from '../../lib/interfaceParse'
import { BOND_HASH_POLICIES, BOND_LACP_RATES, BOND_MODES, type BondInterface } from '../../lib/interfaceTypes'
import { isValidVyOSIdentifier } from '../../lib/vyosIdentifier'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function BondingPage() {
  const { bondInterfaces, vrfs, isLoading, isError } = useInterfaceConfig()
  const [showCreate, setShowCreate] = useState(false)
  const vrfOptions = vrfs.map((v) => v.name)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400">
          A bond combines multiple interfaces into one logical link for redundancy and/or
          throughput.
        </p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className={`shrink-0 bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New bond'}
        </button>
      </div>

      {showCreate && (
        <CreateBondForm existingNames={bondInterfaces.map((b) => b.name)} onDone={() => setShowCreate(false)} />
      )}

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load interface configuration.</p>}

      <div className="space-y-3">
        {bondInterfaces.map((bond) => (
          <BondCard key={bond.name} bond={bond} vrfOptions={vrfOptions} />
        ))}
        {!isLoading && bondInterfaces.length === 0 && (
          <p className="text-sm text-slate-500">No bonds configured yet.</p>
        )}
      </div>
    </div>
  )
}

function CreateBondForm({ existingNames, onDone }: { existingNames: string[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<(typeof BOND_MODES)[number]>('802.3ad')
  const [firstMember, setFirstMember] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const nameTaken = existingNames.includes(trimmedName)
  const valid = isValidVyOSIdentifier(trimmedName) && !nameTaken && firstMember.trim() !== ''

  function submit() {
    if (!valid) return
    const member = firstMember.trim()
    add({
      op: { op: 'set', path: bondPath(trimmedName, 'member', 'interface'), value: member },
      label: `set interfaces bonding ${trimmedName} member interface '${member}'`,
    })
    if (mode !== '802.3ad') {
      add({
        op: { op: 'set', path: bondPath(trimmedName, 'mode'), value: mode },
        label: `set interfaces bonding ${trimmedName} mode '${mode}'`,
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
            placeholder="bond0"
            className={inputClass}
          />
          {nameTaken && <span className="text-danger-500">bond {trimmedName} already exists.</span>}
        </label>
        <label className={labelClass}>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as (typeof BOND_MODES)[number])} className={inputClass}>
            {BOND_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
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
        Queue bond creation
      </button>
    </div>
  )
}

function BondCard({ bond, vrfOptions }: { bond: BondInterface; vrfOptions: string[] }) {
  const [editing, setEditing] = useState(false)
  const [newMember, setNewMember] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete() {
    add({ op: { op: 'delete', path: bondPath(bond.name) }, label: `delete interfaces bonding ${bond.name}` })
  }

  function queueAddMember() {
    if (!newMember.trim()) return
    add({
      op: { op: 'set', path: bondPath(bond.name, 'member', 'interface'), value: newMember.trim() },
      label: `set interfaces bonding ${bond.name} member interface '${newMember.trim()}'`,
    })
    setNewMember('')
  }

  function queueRemoveMember(member: string) {
    add({
      op: { op: 'delete', path: bondPath(bond.name, 'member', 'interface'), value: member },
      label: `delete interfaces bonding ${bond.name} member interface '${member}'`,
    })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-sm font-medium text-white">
            {bond.name}
            {bond.disabled && <span className="ml-2 text-xs text-slate-500">(disabled)</span>}
          </h3>
          {bond.description && <p className="mt-0.5 text-xs text-slate-400">{bond.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <button onClick={() => setEditing((v) => !v)} className="text-accent-500 hover:text-accent-400">
            {editing ? 'Cancel' : 'Edit'}
          </button>
          <button onClick={queueDelete} className="text-slate-500 hover:text-danger-500">
            Delete bond
          </button>
        </div>
      </div>

      {editing ? (
        <BondEditForm bond={bond} vrfOptions={vrfOptions} onDone={() => setEditing(false)} />
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Mode</dt>
            <dd className="font-mono text-slate-300">{bond.mode}</dd>
          </div>
          <div>
            <dt className="text-slate-500">MTU</dt>
            <dd className="font-mono text-slate-300">{bond.mtu ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">VRF</dt>
            <dd className="font-mono text-slate-300">{bond.vrf || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Primary</dt>
            <dd className="font-mono text-slate-300">{bond.primary || '—'}</dd>
          </div>
        </dl>
      )}

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">Member interfaces</p>
        <div className="flex flex-wrap gap-1.5">
          {bond.members.map((member) => (
            <span
              key={member}
              className="flex items-center gap-1 rounded bg-surface-800 px-2 py-0.5 font-mono text-xs text-slate-300"
            >
              {member}
              <button
                onClick={() => queueRemoveMember(member)}
                className="text-slate-500 hover:text-danger-500"
                aria-label={`Remove member ${member} from bond ${bond.name}`}
              >
                ✕
              </button>
            </span>
          ))}
          {bond.members.length === 0 && <span className="text-xs text-slate-500">No member interfaces.</span>}
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
          addresses={bond.addresses}
          basePath={bondPath(bond.name)}
          pathLabel={`interfaces bonding ${bond.name} address`}
        />
      </div>

      <VlanSection
        parentPath={bondPath(bond.name)}
        parentPathLabel={`interfaces bonding ${bond.name}`}
        vlans={bond.vlans}
        vrfOptions={vrfOptions}
      />
    </div>
  )
}

function BondEditForm({
  bond,
  vrfOptions,
  onDone,
}: {
  bond: BondInterface
  vrfOptions: string[]
  onDone: () => void
}) {
  const [values, setValues] = useState<BondFormValues>(bondToFormValues(bond))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof BondFormValues>(key: K, value: BondFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = bondFormToOps(bond.name, bond, values)
    for (const op of ops) {
      const field = op.path[op.path.length - 1]
      add({
        op,
        label: `${op.op} interfaces bonding ${bond.name} ${field}${op.value ? ` '${op.value}'` : ''}`,
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
        Mode
        <select value={values.mode} onChange={(e) => update('mode', e.target.value as BondFormValues['mode'])} className={inputClass}>
          {BOND_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
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
        Hash policy
        <select
          value={values.hashPolicy}
          onChange={(e) => update('hashPolicy', e.target.value as BondFormValues['hashPolicy'])}
          className={inputClass}
        >
          <option value="">(default)</option>
          {BOND_HASH_POLICIES.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Primary member
        <input
          {...noExtensionInputProps}
          value={values.primary}
          onChange={(e) => update('primary', e.target.value)}
          placeholder="active-backup / TLB / ALB modes only"
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        LACP rate
        <select
          value={values.lacpRate}
          onChange={(e) => update('lacpRate', e.target.value as BondFormValues['lacpRate'])}
          className={inputClass}
        >
          <option value="">(default)</option>
          {BOND_LACP_RATES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Min links
        <input
          {...noExtensionInputProps}
          value={values.minLinks}
          onChange={(e) => update('minLinks', e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="802.3ad only"
          className={inputClass}
        />
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
