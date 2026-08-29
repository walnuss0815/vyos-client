import { pkiCAPath } from './pkiParse'
import type { PKICertificateAuthority } from './pkiTypes'
import type { ConfigOp } from './vyosApi'

export interface PKICAFormValues {
  description: string
  /** Not masked - a CA certificate is public. */
  certificate: string
  /** Write-only, like every other masked credential in this app (see
   * BGPPeerFormValues.password's doc comment for the general
   * convention) - blank means "leave unchanged", always queued fresh
   * when non-blank. */
  privateKey: string
  passwordProtected: boolean
  systemInstall: boolean
  revoked: boolean
}

// Deliberately excludes crls (a multi-valued leaf, managed directly
// via the generic ChipList component in the UI, same as
// StaticRouteCard.tsx's dhcp-interface list).

export function blankCAFormValues(): PKICAFormValues {
  return {
    description: '',
    certificate: '',
    privateKey: '',
    passwordProtected: false,
    systemInstall: false,
    revoked: false,
  }
}

export function caToFormValues(ca: PKICertificateAuthority): PKICAFormValues {
  return {
    description: ca.description ?? '',
    certificate: ca.certificate ?? '',
    privateKey: '',
    passwordProtected: ca.passwordProtected,
    systemInstall: ca.systemInstall,
    revoked: ca.revoked,
  }
}

/**
 * Diffs `before` (the CA as last fetched, or undefined when creating
 * a new one) against `values`, same set-or-delete-per-field approach
 * as every other diffed form in this codebase.
 */
export function caFormToOps(
  name: string,
  before: PKICertificateAuthority | undefined,
  values: PKICAFormValues,
): ConfigOp[] {
  const beforeValues = before ? caToFormValues(before) : blankCAFormValues()
  const ops: ConfigOp[] = []
  const base = pkiCAPath(name)

  if (beforeValues.description !== values.description) {
    const path = [...base, 'description']
    if (values.description.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.description.trim() })
  }

  if (beforeValues.certificate !== values.certificate) {
    const path = [...base, 'certificate']
    if (values.certificate.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.certificate.trim() })
  }

  if (beforeValues.passwordProtected !== values.passwordProtected) {
    const path = [...base, 'private', 'password-protected']
    ops.push(values.passwordProtected ? { op: 'set', path } : { op: 'delete', path })
  }

  if (beforeValues.systemInstall !== values.systemInstall) {
    const path = [...base, 'system-install']
    ops.push(values.systemInstall ? { op: 'set', path } : { op: 'delete', path })
  }

  if (beforeValues.revoked !== values.revoked) {
    const path = [...base, 'revoke']
    ops.push(values.revoked ? { op: 'set', path } : { op: 'delete', path })
  }

  const trimmedPrivateKey = values.privateKey.trim()
  if (trimmedPrivateKey) {
    ops.push({ op: 'set', path: [...base, 'private', 'key'], value: trimmedPrivateKey })
  }

  return ops
}

export function deleteCAOp(name: string): ConfigOp {
  return { op: 'delete', path: pkiCAPath(name) }
}
