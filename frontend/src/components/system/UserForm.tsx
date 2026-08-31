import { useState } from 'react'
import {
  addPublicKeyOps,
  blankUserFormValues,
  userFormToOps,
  userToFormValues,
  type SystemUserFormValues,
} from '../../lib/systemUserForm'
import { SSH_KEY_TYPES, type SystemUser } from '../../lib/systemTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

interface UserFormProps {
  /** undefined = creating a new user. */
  user?: SystemUser
  existingUsernames: string[]
  onDone: () => void
}

export default function UserForm({ user, existingUsernames, onDone }: UserFormProps) {
  const [username, setUsername] = useState(user?.username ?? '')
  const [values, setValues] = useState<SystemUserFormValues>(
    user ? userToFormValues(user) : blankUserFormValues(),
  )
  const [firstKeyIdentifier, setFirstKeyIdentifier] = useState('')
  const [firstKeyData, setFirstKeyData] = useState('')
  const [firstKeyType, setFirstKeyType] = useState('ssh-ed25519')
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = user === undefined
  const trimmedUsername = username.trim()
  const usernameTaken = isCreate && existingUsernames.includes(trimmedUsername)
  const canSubmit = trimmedUsername !== '' && !usernameTaken

  function update<K extends keyof SystemUserFormValues>(key: K, value: SystemUserFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = userFormToOps(trimmedUsername, user, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    // SSH public keys used to only be addable AFTER a user already
    // existed - UserList.tsx's PublicKeysSection only ever operates on
    // an already-fetched user. Not a VyOS commit-blocking requirement
    // (a password-only user commits fine), but a real convenience gap
    // for the common case of wanting key-only auth from the start,
    // without ever setting a password at all. Queuing it here, in the
    // same commit as creation, avoids that detour.
    const trimmedIdentifier = firstKeyIdentifier.trim()
    if (isCreate && trimmedIdentifier && firstKeyData.trim()) {
      const keyOps = addPublicKeyOps(trimmedUsername, trimmedIdentifier, firstKeyData.trim(), firstKeyType, '')
      for (const op of keyOps) {
        add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
      }
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">
        {isCreate ? 'New user' : `Edit user ${user.username}`}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Username *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          />
          {usernameTaken && <span className="text-danger-500">This user already exists.</span>}
        </label>
        <label className={labelClass}>
          Full name
          <input
            {...noExtensionInputProps}
            value={values.fullName}
            onChange={(e) => update('fullName', e.target.value)}
            className={inputClass}
          />
        </label>
        <FieldLabel
          label={`Password ${!isCreate && user.hasPassword ? '(configured - leave blank to keep)' : ''}`}
          hint="Entered here in plaintext but never stored that way - VyOS one-way hashes it during commit, so it can't later be read back or exported."
        >
          <input
            {...noExtensionInputProps}
            type="password"
            value={values.password}
            onChange={(e) => update('password', e.target.value)}
            placeholder={!isCreate && user.hasPassword ? '••••••••' : 'plaintext - VyOS hashes on commit'}
            className={inputClass}
          />
        </FieldLabel>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.disabled}
            onChange={(e) => update('disabled', e.target.checked)}
            className="accent-accent-500"
          />
          Disable this account
          <InfoTooltip text="Locks out login for this user without deleting their account or configuration - re-enable it later to restore access exactly as it was." />
        </label>
      </div>

      {isCreate && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <p className="mb-2 flex items-center gap-1 text-xs text-slate-500">
            First SSH public key (optional)
            <InfoTooltip text="Lets this user log in by key from the very first commit, without ever setting a password - more keys can be added afterward from this user's own card. Type must match the key's algorithm and the data field takes only the base64 blob from a standard authorized_keys line (not the leading type or trailing comment)." />
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              {...noExtensionInputProps}
              value={firstKeyIdentifier}
              onChange={(e) => setFirstKeyIdentifier(e.target.value)}
              placeholder="alice@laptop"
              className={inputClass}
            />
            <select value={firstKeyType} onChange={(e) => setFirstKeyType(e.target.value)} className={inputClass}>
              {SSH_KEY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={firstKeyData}
            onChange={(e) => setFirstKeyData(e.target.value)}
            placeholder="AAAAB3NzaC1yc2EA... (base64 key data only, no type prefix or comment)"
            rows={2}
            className={`mt-2 w-full ${inputClass}`}
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue user creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
