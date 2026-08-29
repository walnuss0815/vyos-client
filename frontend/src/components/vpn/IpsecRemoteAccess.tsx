import { useState } from 'react'
import ChipList from '../ChipList'
import { ipsecRemoteAccessPoolPath } from '../../lib/vpnIpsecParse'
import {
  addRemoteAccessLocalUserOps,
  addRemoteAccessPoolOps,
  addRemoteAccessRadiusServerOps,
  blankConnectionFormValues,
  blankRemoteAccessRadiusSettingsFormValues,
  connectionFormToOps,
  connectionToFormValues,
  deleteConnectionOp,
  remoteAccessRadiusSettingsFormToOps,
  remoteAccessRadiusToFormValues,
  removeRemoteAccessLocalUserOp,
  removeRemoteAccessPoolOp,
  removeRemoteAccessRadiusServerOp,
  type ConnectionFormValues,
} from '../../lib/vpnIpsecForm'
import {
  IPSEC_RA_CLIENT_MODES,
  IPSEC_RA_SERVER_MODES,
  IPSEC_RA_UNIQUE_OPTIONS,
  type IPsecConfig,
  type IPsecRemoteAccessConnection,
} from '../../lib/vpnIpsecTypes'
import FieldLabel from '../FieldLabel'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function IpsecRemoteAccess({ config }: { config: IPsecConfig }) {
  return (
    <div className="space-y-8">
      <ConnectionsSection config={config} />
      <PoolsSection config={config} />
      <RadiusSection config={config} />
    </div>
  )
}

function ConnectionsSection({ config }: { config: IPsecConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)
  const { connections } = config.remoteAccess

  function queueDelete(name: string) {
    const op = deleteConnectionOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? connections.find((c) => c.name === editingName) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          IKEv2 connections ({connections.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingName(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New connection'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <ConnectionForm existingNames={connections.map((c) => c.name)} espGroups={config.espGroups.map((g) => g.name)} ikeGroups={config.ikeGroups.map((g) => g.name)} onDone={() => setShowCreate(false)} />
        </div>
      )}
      {editing && (
        <div className="mb-3">
          <ConnectionForm connection={editing} existingNames={connections.map((c) => c.name)} espGroups={config.espGroups.map((g) => g.name)} ikeGroups={config.ikeGroups.map((g) => g.name)} onDone={() => setEditingName(null)} />
        </div>
      )}

      <div className="space-y-3">
        {connections.map((conn) => (
          <div key={conn.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-medium text-white">{conn.name}</span>
                {conn.disabled && (
                  <span className="ml-2 rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">disabled</span>
                )}
                <p className="text-xs text-slate-400">{conn.description || conn.authentication.clientMode || 'eap-mschapv2'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button onClick={() => setExpandedName((n) => (n === conn.name ? null : conn.name))} className="text-accent-500 hover:text-accent-400">
                  {expandedName === conn.name ? 'Hide users' : 'Local users'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(conn.name)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(conn.name)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {expandedName === conn.name && <LocalUsersSection connection={conn} />}
          </div>
        ))}
        {connections.length === 0 && <p className="text-xs text-slate-500">No IKEv2 connections configured yet.</p>}
      </div>
    </div>
  )
}

function ConnectionForm({
  connection,
  existingNames,
  espGroups,
  ikeGroups,
  onDone,
}: {
  connection?: IPsecRemoteAccessConnection
  existingNames: string[]
  espGroups: string[]
  ikeGroups: string[]
  onDone: () => void
}) {
  const [name, setName] = useState(connection?.name ?? '')
  const [values, setValues] = useState<ConnectionFormValues>(connection ? connectionToFormValues(connection) : blankConnectionFormValues())
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = connection === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof ConnectionFormValues>(key: K, value: ConnectionFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = connectionFormToOps(trimmedName, connection, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New connection' : `Edit ${connection.name}`}</h3>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Name *
          <input {...noExtensionInputProps} autoFocus disabled={!isCreate} value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} disabled:opacity-60`} />
          {nameTaken && <span className="text-danger-500">This connection already exists.</span>}
        </label>
        <label className={labelClass}>
          Description
          <input {...noExtensionInputProps} value={values.description} onChange={(e) => update('description', e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Local address
          <input {...noExtensionInputProps} value={values.localAddress} onChange={(e) => update('localAddress', e.target.value)} placeholder="192.0.2.1 or any" className={inputClass} />
        </label>
        <label className={labelClass}>
          ESP group
          <select value={values.espGroup} onChange={(e) => update('espGroup', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {espGroups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          IKE group
          <select value={values.ikeGroup} onChange={(e) => update('ikeGroup', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {ikeGroups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <FieldLabel
          label="Client auth mode"
          hint="How connecting clients (e.g. laptops/phones) prove their identity - eap-mschapv2 is the standard username/password method most VPN clients support out of the box."
        >
          <select value={values.clientMode} onChange={(e) => update('clientMode', e.target.value)} className={inputClass}>
            <option value="">Default (eap-mschapv2)</option>
            {IPSEC_RA_CLIENT_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel
          label="Server auth mode"
          hint="How this router proves its own identity to connecting clients - x509 (a certificate clients can verify) or a shared pre-shared-secret."
        >
          <select value={values.serverMode} onChange={(e) => update('serverMode', e.target.value)} className={inputClass}>
            <option value="">Default (x509)</option>
            {IPSEC_RA_SERVER_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FieldLabel>
        {values.serverMode === 'pre-shared-secret' && (
          <label className={labelClass}>
            Pre-shared secret {!isCreate ? '(leave blank to keep)' : ''}
            <input {...noExtensionInputProps} type="password" value={values.hasPreSharedSecret} onChange={(e) => update('hasPreSharedSecret', e.target.value)} className={inputClass} />
          </label>
        )}
        <FieldLabel label="EAP ID" hint="The identity this router presents during EAP authentication - defaults to 'any', matching regardless of what the client sends.">
          <input {...noExtensionInputProps} value={values.eapId} onChange={(e) => update('eapId', e.target.value)} placeholder="any" className={inputClass} />
        </FieldLabel>
        <label className={labelClass}>
          Inactivity timeout (s)
          <input {...noExtensionInputProps} value={values.timeout} onChange={(e) => update('timeout', e.target.value)} placeholder="28800" className={inputClass} />
        </label>
        <FieldLabel
          label="Uniqueness"
          hint="What happens when the same client identity connects again while an old session is still active - e.g. replace the old session (keep) or reject the new one."
        >
          <select value={values.unique} onChange={(e) => update('unique', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {IPSEC_RA_UNIQUE_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </FieldLabel>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <input type="checkbox" checked={values.disabled} onChange={(e) => update('disabled', e.target.checked)} className="accent-accent-500" />
        Disable this connection
      </label>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
      </div>
    </div>
  )
}

function LocalUsersSection({ connection }: { connection: IPsecRemoteAccessConnection }) {
  const [showAdd, setShowAdd] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = username.trim()
  const taken = connection.authentication.localUsers.some((u) => u.username === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addRemoteAccessLocalUserOps(connection.name, trimmed, password)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setUsername('')
    setPassword('')
    setShowAdd(false)
  }

  return (
    <div className="mt-3 border-t border-surface-border pt-3">
      <p className="mb-1 text-xs text-slate-500">Local users (EAP-MSCHAPv2)</p>
      {connection.authentication.localUsers.map((user) => (
        <div key={user.username} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {user.username}
            {user.hasPassword && <span className="text-slate-500"> · password set</span>}
          </span>
          <button
            onClick={() => {
              const op = removeRemoteAccessLocalUserOp(connection.name, user.username)
              add({ op, label: `delete ${op.path.join(' ')}` })
            }}
            className="text-xs text-slate-500 hover:text-danger-500"
          >
            Remove
          </button>
        </div>
      ))}
      {connection.authentication.localUsers.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add user'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className={inputClass} />
          <input {...noExtensionInputProps} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>Add</button>
          {taken && <p className="col-span-3 text-xs text-danger-500">This username is already used.</p>}
        </div>
      )}
    </div>
  )
}

function PoolsSection({ config }: { config: IPsecConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeStop, setRangeStop] = useState('')
  const add = usePendingChangesStore((s) => s.add)
  const { pools } = config.remoteAccess

  const trimmedName = name.trim()
  const taken = pools.some((p) => p.name === trimmedName)
  const valid = trimmedName !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addRemoteAccessPoolOps(trimmedName, { prefix, rangeStart, rangeStop })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setName('')
    setPrefix('')
    setRangeStart('')
    setRangeStop('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Client IP pools ({pools.length})</h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add pool'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-surface-border bg-surface-900 p-4 sm:grid-cols-4">
          <input {...noExtensionInputProps} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="pool name" className={inputClass} />
          <input {...noExtensionInputProps} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="prefix (10.10.0.0/24)" className={inputClass} />
          <input {...noExtensionInputProps} value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} placeholder="range start (optional)" className={inputClass} />
          <input {...noExtensionInputProps} value={rangeStop} onChange={(e) => setRangeStop(e.target.value)} placeholder="range stop (optional)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-4 bg-accent-600 ${buttonClass}`}>Add pool</button>
          {taken && <p className="col-span-4 text-xs text-danger-500">This pool already exists.</p>}
        </div>
      )}
      <div className="space-y-2">
        {pools.map((pool) => (
          <div key={pool.name} className="rounded-xl border border-surface-border bg-surface-900 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-300">
                {pool.name}: {pool.prefix ?? `${pool.rangeStart ?? '?'} - ${pool.rangeStop ?? '?'}`}
              </span>
              <button
                onClick={() => {
                  const op = removeRemoteAccessPoolOp(pool.name)
                  add({ op, label: `delete ${op.path.join(' ')}` })
                }}
                className="text-xs text-slate-500 hover:text-danger-500"
              >
                Remove
              </button>
            </div>
            <div className="mt-1">
              <ChipList values={pool.nameServers} basePath={ipsecRemoteAccessPoolPath(pool.name)} leaf="name-server" pathLabel={`vpn ipsec remote-access pool ${pool.name} name-server`} placeholder="192.0.2.1 (DNS)" />
            </div>
          </div>
        ))}
        {pools.length === 0 && <p className="text-xs text-slate-500">No pools configured yet.</p>}
      </div>
    </div>
  )
}

function RadiusSection({ config }: { config: IPsecConfig }) {
  const { radius } = config.remoteAccess
  const [values, setValues] = useState(() => remoteAccessRadiusToFormValues(radius))
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [key, setKey] = useState('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankRemoteAccessRadiusSettingsFormValues>>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = remoteAccessRadiusSettingsFormToOps(radius, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  const trimmedAddress = address.trim()
  const taken = radius.servers.some((s) => s.address === trimmedAddress)
  const valid = trimmedAddress !== '' && !taken

  function submitServer() {
    if (!valid) return
    const ops = addRemoteAccessRadiusServerOps(trimmedAddress, key, port)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setKey('')
    setPort('')
    setShowAdd(false)
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">RADIUS</h2>
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            Source address
            <input {...noExtensionInputProps} value={values.sourceAddress} onChange={(e) => update('sourceAddress', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Session timeout (s)
            <input {...noExtensionInputProps} value={values.timeout} onChange={(e) => update('timeout', e.target.value)} placeholder="2" className={inputClass} />
          </label>
          <label className={labelClass}>
            NAS identifier
            <input {...noExtensionInputProps} value={values.nasIdentifier} onChange={(e) => update('nasIdentifier', e.target.value)} className={inputClass} />
          </label>
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>Save settings</button>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs text-slate-500">Servers ({radius.servers.length})</p>
            <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
              {showAdd ? 'Cancel' : '+ Add'}
            </button>
          </div>
          {showAdd && (
            <div className="mb-2 grid grid-cols-3 gap-2">
              <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.0.2.9" className={inputClass} />
              <input {...noExtensionInputProps} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="shared secret" className={inputClass} />
              <input {...noExtensionInputProps} value={port} onChange={(e) => setPort(e.target.value)} placeholder="port (default 1812)" className={inputClass} />
              <button onClick={submitServer} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>Add server</button>
              {taken && <p className="col-span-3 text-xs text-danger-500">Already configured.</p>}
            </div>
          )}
          <div className="space-y-1">
            {radius.servers.map((server) => (
              <div key={server.address} className="flex items-center justify-between rounded border border-surface-border p-2">
                <span className="font-mono text-xs text-slate-300">
                  {server.address}
                  {server.port && `:${server.port}`}
                  {server.hasKey && <span className="text-slate-500"> · key set</span>}
                </span>
                <button
                  onClick={() => {
                    const op = removeRemoteAccessRadiusServerOp(server.address)
                    add({ op, label: `delete ${op.path.join(' ')}` })
                  }}
                  className="text-xs text-slate-500 hover:text-danger-500"
                >
                  Remove
                </button>
              </div>
            ))}
            {radius.servers.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
