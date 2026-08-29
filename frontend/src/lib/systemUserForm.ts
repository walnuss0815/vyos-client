import { publicKeyPath, userPath } from './systemParse'
import type { SystemUser } from './systemTypes'
import type { ConfigOp } from './vyosApi'

export interface SystemUserFormValues {
  fullName: string
  disabled: boolean
  /** Write-only, like BGPPeerFormValues.password - see that type's
   * doc comment for the general convention. Sent as
   * `authentication plaintext-password`; VyOS hashes it into
   * `encrypted-password` on commit and this app never sees the
   * result (it's masked). Blank means "leave unchanged"; always
   * queued fresh when non-blank, regardless of hasPassword. */
  password: string
}

export function blankUserFormValues(): SystemUserFormValues {
  return { fullName: '', disabled: false, password: '' }
}

export function userToFormValues(user: SystemUser): SystemUserFormValues {
  return { fullName: user.fullName ?? '', disabled: user.disabled, password: '' }
}

/**
 * Diffs `before` against `values`, same set-or-delete-per-field
 * approach as bgpPeerForm.ts's peerFormToOps.
 */
export function userFormToOps(
  username: string,
  before: SystemUser | undefined,
  values: SystemUserFormValues,
): ConfigOp[] {
  const beforeValues = before ? userToFormValues(before) : blankUserFormValues()
  const ops: ConfigOp[] = []
  const base = userPath(username)

  if (beforeValues.fullName !== values.fullName) {
    const path = [...base, 'full-name']
    if (values.fullName.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.fullName.trim() })
  }

  if (beforeValues.disabled !== values.disabled) {
    const path = [...base, 'disable']
    ops.push(values.disabled ? { op: 'set', path } : { op: 'delete', path })
  }

  const trimmedPassword = values.password.trim()
  if (trimmedPassword) {
    ops.push({
      op: 'set',
      path: [...base, 'authentication', 'plaintext-password'],
      value: trimmedPassword,
    })
  }

  return ops
}

export function deleteUserOp(username: string): ConfigOp {
  return { op: 'delete', path: userPath(username) }
}

export function addPublicKeyOps(
  username: string,
  identifier: string,
  key: string,
  type: string,
  options: string,
): ConfigOp[] {
  const base = publicKeyPath(username, identifier)
  const ops: ConfigOp[] = [{ op: 'set', path: [...base, 'key'], value: key }]
  if (type) {
    ops.push({ op: 'set', path: [...base, 'type'], value: type })
  }
  const trimmedOptions = options.trim()
  if (trimmedOptions) {
    ops.push({ op: 'set', path: [...base, 'options'], value: trimmedOptions })
  }
  return ops
}

export function removePublicKeyOp(username: string, identifier: string): ConfigOp {
  return { op: 'delete', path: publicKeyPath(username, identifier) }
}
