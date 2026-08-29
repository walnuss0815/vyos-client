import { useState } from 'react'
import ChipList from '../ChipList'
import { snmpV3ViewOidPath } from '../../lib/serviceSnmpParse'
import {
  addSNMPv3GroupOps,
  addSNMPv3TrapTargetOps,
  addSNMPv3UserOps,
  addSNMPv3ViewOidOps,
  addSNMPv3ViewOp,
  removeSNMPv3GroupOp,
  removeSNMPv3TrapTargetOp,
  removeSNMPv3UserOp,
  removeSNMPv3ViewOidOp,
  removeSNMPv3ViewOp,
  snmpV3EngineIdFormToOps,
} from '../../lib/serviceSnmpForm'
import {
  SNMP_V3_ACCESS_MODES,
  SNMP_V3_AUTH_TYPES,
  SNMP_V3_PRIVACY_TYPES,
  SNMP_V3_SECLEVELS,
  SNMP_V3_TRAP_TYPES,
  type SNMPv3Config,
  type SNMPv3View,
} from '../../lib/serviceSnmpTypes'
import { SNMP_PROTOCOLS } from '../../lib/serviceSnmpTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

export default function Snmpv3Section({ v3 }: { v3: SNMPv3Config }) {
  return (
    <div className="space-y-6">
      <EngineIdField v3={v3} />
      <GroupsSection v3={v3} />
      <UsersSection v3={v3} />
      <ViewsSection v3={v3} />
      <V3TrapTargetsSection v3={v3} />
    </div>
  )
}

function EngineIdField({ v3 }: { v3: SNMPv3Config }) {
  const [value, setValue] = useState(v3.engineId ?? '')
  const add = usePendingChangesStore((s) => s.add)

  function save() {
    const ops = snmpV3EngineIdFormToOps(v3.engineId, value)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          Engine ID (hex, even length 2-36)
          <InfoTooltip text="Uniquely identifies this SNMP daemon and is mixed into how v3 user credentials are derived - normally auto-generated; only override it to match a specific value expected by monitoring software." />
        </span>
        <input {...noExtensionInputProps} value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} w-80`} />
      </label>
      <button onClick={save} className={`bg-accent-600 ${buttonClass}`}>
        Save
      </button>
    </div>
  )
}

function GroupsSection({ v3 }: { v3: SNMPv3Config }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [mode, setMode] = useState('')
  const [seclevel, setSeclevel] = useState('')
  const [view, setView] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = name.trim()
  const taken = v3.groups.some((g) => g.name === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addSNMPv3GroupOps(trimmed, mode, seclevel, view)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setName('')
    setMode('')
    setSeclevel('')
    setView('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Groups ({v3.groups.length})
          <InfoTooltip text="Defines what access level and security requirements a set of v3 users share, and optionally restricts them to a view - users join a group by name below." />
        </h3>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add group'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input {...noExtensionInputProps} value={name} onChange={(e) => setName(e.target.value)} placeholder="name" className={inputClass} />
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
            <option value="">Default (ro)</option>
            {SNMP_V3_ACCESS_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select value={seclevel} onChange={(e) => setSeclevel(e.target.value)} className={inputClass}>
            <option value="">Default (auth)</option>
            {SNMP_V3_SECLEVELS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input {...noExtensionInputProps} value={view} onChange={(e) => setView(e.target.value)} placeholder="view name" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-4 bg-accent-600 ${buttonClass}`}>
            Add group
          </button>
          {taken && <p className="col-span-4 text-xs text-danger-500">Already exists.</p>}
        </div>
      )}
      <div className="space-y-1">
        {v3.groups.map((g) => (
          <div key={g.name} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {g.name} <span className="text-slate-500">{g.mode ?? 'ro'}/{g.seclevel ?? 'auth'}{g.view ? ` view=${g.view}` : ''}</span>
            </span>
            <button
              onClick={() => {
                const op = removeSNMPv3GroupOp(g.name)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {v3.groups.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}

function UsersSection({ v3 }: { v3: SNMPv3Config }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [mode, setMode] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authType, setAuthType] = useState('')
  const [privacyPassword, setPrivacyPassword] = useState('')
  const [privacyType, setPrivacyType] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = name.trim()
  const taken = v3.users.some((u) => u.name === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addSNMPv3UserOps(trimmed, { authPassword, authType, group, mode, privacyPassword, privacyType })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setName('')
    setGroup('')
    setMode('')
    setAuthPassword('')
    setAuthType('')
    setPrivacyPassword('')
    setPrivacyType('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Users ({v3.users.length})
          <InfoTooltip text="Each v3 user has its own credentials instead of a shared community string - auth password proves identity, privacy password additionally encrypts the traffic." />
        </h3>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add user'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 space-y-2 rounded border border-surface-border p-3">
          <div className="grid grid-cols-3 gap-2">
            <input {...noExtensionInputProps} value={name} onChange={(e) => setName(e.target.value)} placeholder="username" className={inputClass} />
            <input {...noExtensionInputProps} value={group} onChange={(e) => setGroup(e.target.value)} placeholder="group name" className={inputClass} />
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
              <option value="">Default (ro)</option>
              {SNMP_V3_ACCESS_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input {...noExtensionInputProps} type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="auth password (min 8 chars)" className={inputClass} />
            <select value={authType} onChange={(e) => setAuthType(e.target.value)} className={inputClass}>
              <option value="">Default auth type (md5)</option>
              {SNMP_V3_AUTH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input {...noExtensionInputProps} type="password" value={privacyPassword} onChange={(e) => setPrivacyPassword(e.target.value)} placeholder="privacy password (min 8 chars)" className={inputClass} />
            <select value={privacyType} onChange={(e) => setPrivacyType(e.target.value)} className={inputClass}>
              <option value="">Default privacy type (des)</option>
              {SNMP_V3_PRIVACY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add user
          </button>
          {taken && <p className="text-xs text-danger-500">Already exists.</p>}
        </div>
      )}
      <div className="space-y-1">
        {v3.users.map((u) => (
          <div key={u.name} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {u.name}
              {u.group && <span className="text-slate-500"> group={u.group}</span>}
              {u.auth.hasPassword && <span className="text-slate-500"> · auth set</span>}
              {u.privacy.hasPassword && <span className="text-slate-500"> · privacy set</span>}
            </span>
            <button
              onClick={() => {
                const op = removeSNMPv3UserOp(u.name)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {v3.users.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}

function ViewsSection({ v3 }: { v3: SNMPv3Config }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = name.trim()
  const taken = v3.views.some((v) => v.name === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const op = addSNMPv3ViewOp(trimmed)
    add({ op, label: `set ${op.path.join(' ')}` })
    setName('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Views ({v3.views.length})
          <InfoTooltip text="A named allow-list of OID sub-trees a group can access - without a view assigned to a group, its members can browse the entire MIB." />
        </h3>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add view'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 flex items-center gap-2">
          <input {...noExtensionInputProps} value={name} onChange={(e) => setName(e.target.value)} placeholder="view name" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="text-xs text-danger-500">Already exists.</p>}
        </div>
      )}
      <div className="space-y-2">
        {v3.views.map((view) => (
          <div key={view.name} className="rounded border border-surface-border p-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-300">{view.name}</span>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setExpandedName((n) => (n === view.name ? null : view.name))} className="text-accent-500 hover:text-accent-400">
                  {expandedName === view.name ? 'Hide' : 'OIDs'}
                </button>
                <button
                  onClick={() => {
                    const op = removeSNMPv3ViewOp(view.name)
                    add({ op, label: `delete ${op.path.join(' ')}` })
                  }}
                  className="text-slate-500 hover:text-danger-500"
                >
                  Remove
                </button>
              </div>
            </div>
            {expandedName === view.name && <ViewOids view={view} />}
          </div>
        ))}
        {v3.views.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}

function ViewOids({ view }: { view: SNMPv3View }) {
  const [showAdd, setShowAdd] = useState(false)
  const [oid, setOid] = useState('')
  const [mask, setMask] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = oid.trim()
  const taken = view.oids.some((o) => o.oid === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addSNMPv3ViewOidOps(view.name, trimmed, mask)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setOid('')
    setMask('')
    setShowAdd(false)
  }

  return (
    <div className="mt-2 border-t border-surface-border pt-2">
      {view.oids.map((o) => (
        <div key={o.oid} className="mb-1 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">
              {o.oid}
              {o.mask && <span className="text-slate-500"> mask={o.mask}</span>}
            </span>
            <button
              onClick={() => {
                const op = removeSNMPv3ViewOidOp(view.name, o.oid)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
          <ChipList
            values={o.exclude}
            basePath={snmpV3ViewOidPath(view.name, o.oid)}
            leaf="exclude"
            pathLabel={`service snmp v3 view ${view.name} oid ${o.oid} exclude`}
            placeholder="excluded sub-OID"
          />
        </div>
      ))}
      {view.oids.length === 0 && <p className="text-xs text-slate-500">No OIDs configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add OID'}
      </button>
      {showAdd && (
        <div className="mt-2 flex items-center gap-2">
          <input {...noExtensionInputProps} value={oid} onChange={(e) => setOid(e.target.value)} placeholder="1.3.6.1" className={inputClass} />
          <input {...noExtensionInputProps} value={mask} onChange={(e) => setMask(e.target.value)} placeholder="mask (optional)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="text-xs text-danger-500">Already configured.</p>}
        </div>
      )}
    </div>
  )
}

function V3TrapTargetsSection({ v3 }: { v3: SNMPv3Config }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authType, setAuthType] = useState('')
  const [privacyPassword, setPrivacyPassword] = useState('')
  const [privacyType, setPrivacyType] = useState('')
  const [port, setPort] = useState('')
  const [protocol, setProtocol] = useState('')
  const [type, setType] = useState('')
  const [user, setUser] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = address.trim()
  const taken = v3.trapTargets.some((t) => t.address === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addSNMPv3TrapTargetOps(trimmed, {
      authPassword,
      authType,
      privacyPassword,
      privacyType,
      port,
      protocol,
      type,
      user,
    })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setAuthPassword('')
    setAuthType('')
    setPrivacyPassword('')
    setPrivacyType('')
    setPort('')
    setProtocol('')
    setType('')
    setUser('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Trap targets ({v3.trapTargets.length})
          <InfoTooltip text="inform notifications require the receiver to acknowledge receipt and are retried until it does; trap notifications are fire-and-forget with no acknowledgment." />
        </h3>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 space-y-2 rounded border border-surface-border p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.0.2.3" className={inputClass} />
            <input {...noExtensionInputProps} value={user} onChange={(e) => setUser(e.target.value)} placeholder="user name" className={inputClass} />
            <input {...noExtensionInputProps} value={port} onChange={(e) => setPort(e.target.value)} placeholder="port (default 162)" className={inputClass} />
            <select value={protocol} onChange={(e) => setProtocol(e.target.value)} className={inputClass}>
              <option value="">Default (udp)</option>
              {SNMP_PROTOCOLS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              <option value="">Default (inform)</option>
              {SNMP_V3_TRAP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input {...noExtensionInputProps} type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="auth password" className={inputClass} />
            <select value={authType} onChange={(e) => setAuthType(e.target.value)} className={inputClass}>
              <option value="">Default auth type (md5)</option>
              {SNMP_V3_AUTH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input {...noExtensionInputProps} type="password" value={privacyPassword} onChange={(e) => setPrivacyPassword(e.target.value)} placeholder="privacy password" className={inputClass} />
            <select value={privacyType} onChange={(e) => setPrivacyType(e.target.value)} className={inputClass}>
              <option value="">Default privacy type (des)</option>
              {SNMP_V3_PRIVACY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add trap target
          </button>
          {taken && <p className="text-xs text-danger-500">Already configured.</p>}
        </div>
      )}
      <div className="space-y-1">
        {v3.trapTargets.map((t) => (
          <div key={t.address} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {t.address}
              {t.user && <span className="text-slate-500"> user={t.user}</span>}
              {t.auth.hasPassword && <span className="text-slate-500"> · auth set</span>}
              {t.privacy.hasPassword && <span className="text-slate-500"> · privacy set</span>}
            </span>
            <button
              onClick={() => {
                const op = removeSNMPv3TrapTargetOp(t.address)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {v3.trapTargets.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}
