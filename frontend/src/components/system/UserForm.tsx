import { useState } from 'react'
import {
  blankUserFormValues,
  userFormToOps,
  userToFormValues,
  type SystemUserFormValues,
} from '../../lib/systemUserForm'
import type { SystemUser } from '../../lib/systemTypes'
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
