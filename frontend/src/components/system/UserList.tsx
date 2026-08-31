import { useState } from 'react'
import UserForm from './UserForm'
import { addPublicKeyOps, deleteUserOp, removePublicKeyOp } from '../../lib/systemUserForm'
import { SSH_KEY_TYPES, type SystemUser } from '../../lib/systemTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

export default function UserList({ users, isLoading }: { users: SystemUser[]; isLoading: boolean }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingUsername, setEditingUsername] = useState<string | null>(null)
  const currentUser = useSessionStore((s) => s.user)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(username: string) {
    const op = deleteUserOp(username)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingUsername ? users.find((u) => u.username === editingUsername) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Users ({users.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingUsername(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New user'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        These are real VyOS local accounts. Under <code>AUTH_MODE=vyos-users</code>, they're also
        the credentials that log into this app - disabling, deleting, or losing the password/key
        for your own account can lock you out. Commit-confirm ("Safe apply") is your safety net
        here, same as everywhere else in this app.
      </p>

      {showCreate && (
        <div className="mb-3">
          <UserForm existingUsernames={users.map((u) => u.username)} onDone={() => setShowCreate(false)} />
        </div>
      )}

      {editing && (
        <div className="mb-3">
          <UserForm user={editing} existingUsernames={users.map((u) => u.username)} onDone={() => setEditingUsername(null)} />
        </div>
      )}

      <div className="space-y-3">
        {users.map((user) => (
          <div key={user.username} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-white">{user.username}</span>
                  {user.username === currentUser && (
                    <span className="rounded bg-accent-600/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-accent-500">
                      you
                    </span>
                  )}
                  {user.disabled && (
                    <span className="rounded bg-danger-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger-500">
                      disabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {user.fullName || 'no full name set'}
                  {user.hasPassword && <span> · password set</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingUsername(user.username)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(user.username)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>

            <PublicKeysSection user={user} />
          </div>
        ))}
        {!isLoading && users.length === 0 && <p className="text-xs text-slate-500">No users configured yet.</p>}
      </div>
    </div>
  )
}

function PublicKeysSection({ user }: { user: SystemUser }) {
  const [showAdd, setShowAdd] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [key, setKey] = useState('')
  const [type, setType] = useState('ssh-ed25519')
  const [options, setOptions] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedIdentifier = identifier.trim()
  const taken = user.publicKeys.some((k) => k.identifier === trimmedIdentifier)
  const valid = trimmedIdentifier !== '' && !taken && key.trim() !== ''

  function submit() {
    if (!valid) return
    const ops = addPublicKeyOps(user.username, trimmedIdentifier, key.trim(), type, options)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setIdentifier('')
    setKey('')
    setOptions('')
    setShowAdd(false)
  }

  function queueRemove(keyIdentifier: string) {
    const op = removePublicKeyOp(user.username, keyIdentifier)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs text-slate-500">
          SSH public keys
          <InfoTooltip text="Type must match the key's algorithm and the data field takes only the base64 blob from a standard authorized_keys line (not the leading type or trailing comment) - VyOS reassembles them internally." />
        </p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add key'}
        </button>
      </div>

      {showAdd && (
        <div className="my-2 space-y-2 rounded border border-surface-border p-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              {...noExtensionInputProps}
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="alice@laptop"
              className={inputClass}
            />
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              {SSH_KEY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AAAAB3NzaC1yc2EA... (base64 key data only, no type prefix or comment)"
            rows={2}
            className={`w-full ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder='options (optional), e.g. from="10.0.0.0/24"'
            className={inputClass}
          />
          {taken && <p className="text-danger-500">This key identifier is already used.</p>}
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add key
          </button>
        </div>
      )}

      <ul className="mt-1 space-y-1">
        {user.publicKeys.map((pk) => (
          <li key={pk.identifier} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              {pk.identifier}
              {pk.type && <span className="text-slate-500"> ({pk.type})</span>}
            </span>
            <button onClick={() => queueRemove(pk.identifier)} className="text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </li>
        ))}
        {user.publicKeys.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
    </div>
  )
}
