import { pkiCertificatePath } from './pkiParse'
import type { PKIAcmeRSAKeySize, PKICertificate } from './pkiTypes'
import type { ConfigOp } from './vyosApi'

export interface PKICertificateFormValues {
  description: string
  /** Not masked - a certificate is public. */
  certificate: string
  /** Write-only - see pkiCAForm.ts's PKICAFormValues.privateKey doc
   * comment for the general convention. */
  privateKey: string
  passwordProtected: boolean
  revoked: boolean
  acmeEmail: string
  acmeListenAddress: string
  acmeRsaKeySize: '' | PKIAcmeRSAKeySize
  acmeUrl: string
}

// Deliberately excludes acme.domainNames (a multi-valued leaf, managed
// directly via the generic ChipList component in the UI).

export function blankCertificateFormValues(): PKICertificateFormValues {
  return {
    description: '',
    certificate: '',
    privateKey: '',
    passwordProtected: false,
    revoked: false,
    acmeEmail: '',
    acmeListenAddress: '',
    acmeRsaKeySize: '',
    acmeUrl: '',
  }
}

export function certificateToFormValues(cert: PKICertificate): PKICertificateFormValues {
  return {
    description: cert.description ?? '',
    certificate: cert.certificate ?? '',
    privateKey: '',
    passwordProtected: cert.passwordProtected,
    revoked: cert.revoked,
    acmeEmail: cert.acme.email ?? '',
    acmeListenAddress: cert.acme.listenAddress ?? '',
    acmeRsaKeySize: cert.acme.rsaKeySize ?? '',
    acmeUrl: cert.acme.url ?? '',
  }
}

interface ScalarField {
  get: (v: PKICertificateFormValues) => string
  segments: string[]
}

const SCALAR_FIELDS: ScalarField[] = [
  { get: (v) => v.description, segments: ['description'] },
  { get: (v) => v.certificate, segments: ['certificate'] },
  { get: (v) => v.acmeEmail, segments: ['acme', 'email'] },
  { get: (v) => v.acmeListenAddress, segments: ['acme', 'listen-address'] },
  { get: (v) => v.acmeRsaKeySize, segments: ['acme', 'rsa-key-size'] },
  { get: (v) => v.acmeUrl, segments: ['acme', 'url'] },
]

/**
 * Diffs `before` (the certificate as last fetched, or undefined when
 * creating a new one) against `values`, same set-or-delete-per-field
 * approach as pkiCAForm.ts's caFormToOps.
 */
export function certificateFormToOps(
  name: string,
  before: PKICertificate | undefined,
  values: PKICertificateFormValues,
): ConfigOp[] {
  const beforeValues = before ? certificateToFormValues(before) : blankCertificateFormValues()
  const ops: ConfigOp[] = []
  const base = pkiCertificatePath(name)

  for (const field of SCALAR_FIELDS) {
    const oldValue = field.get(beforeValues)
    const newValue = field.get(values)
    if (oldValue === newValue) continue
    const path = [...base, ...field.segments]
    if (newValue.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: newValue.trim() })
  }

  if (beforeValues.passwordProtected !== values.passwordProtected) {
    const path = [...base, 'private', 'password-protected']
    ops.push(values.passwordProtected ? { op: 'set', path } : { op: 'delete', path })
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

export function deleteCertificateOp(name: string): ConfigOp {
  return { op: 'delete', path: pkiCertificatePath(name) }
}
