import { pkiDHPath, pkiKeyPairPath } from './pkiParse'
import type { PKIDHParams, PKIKeyPair } from './pkiTypes'
import type { ConfigOp } from './vyosApi'

// --- key-pair ------------------------------------------------------------

export interface PKIKeyPairFormValues {
  /** Write-only, like every other masked credential in this app -
   * masked despite being a public key, since VyOS's leaf name is
   * always exactly `key` regardless of the public/private node it's
   * under (see pkiTypes.ts's doc comment). */
  publicKey: string
  privateKey: string
  passwordProtected: boolean
}

export function blankKeyPairFormValues(): PKIKeyPairFormValues {
  return { publicKey: '', privateKey: '', passwordProtected: false }
}

export function keyPairToFormValues(keyPair: PKIKeyPair): PKIKeyPairFormValues {
  return { publicKey: '', privateKey: '', passwordProtected: keyPair.passwordProtected }
}

export function keyPairFormToOps(
  name: string,
  before: PKIKeyPair | undefined,
  values: PKIKeyPairFormValues,
): ConfigOp[] {
  const beforeValues = before ? keyPairToFormValues(before) : blankKeyPairFormValues()
  const ops: ConfigOp[] = []
  const base = pkiKeyPairPath(name)

  if (beforeValues.passwordProtected !== values.passwordProtected) {
    const path = [...base, 'private', 'password-protected']
    ops.push(values.passwordProtected ? { op: 'set', path } : { op: 'delete', path })
  }

  const trimmedPublicKey = values.publicKey.trim()
  if (trimmedPublicKey) {
    ops.push({ op: 'set', path: [...base, 'public', 'key'], value: trimmedPublicKey })
  }

  const trimmedPrivateKey = values.privateKey.trim()
  if (trimmedPrivateKey) {
    ops.push({ op: 'set', path: [...base, 'private', 'key'], value: trimmedPrivateKey })
  }

  return ops
}

export function deleteKeyPairOp(name: string): ConfigOp {
  return { op: 'delete', path: pkiKeyPairPath(name) }
}

// --- DH parameters -------------------------------------------------------

export interface PKIDHFormValues {
  /** Not masked - DH parameters aren't confidential. */
  parameters: string
}

export function blankDHFormValues(): PKIDHFormValues {
  return { parameters: '' }
}

export function dhToFormValues(dh: PKIDHParams): PKIDHFormValues {
  return { parameters: dh.parameters ?? '' }
}

export function dhFormToOps(
  name: string,
  before: PKIDHParams | undefined,
  values: PKIDHFormValues,
): ConfigOp[] {
  const beforeValues = before ? dhToFormValues(before) : blankDHFormValues()
  const ops: ConfigOp[] = []
  if (beforeValues.parameters !== values.parameters) {
    const path = pkiDHPath(name, 'parameters')
    if (values.parameters.trim() === '') ops.push({ op: 'delete', path })
    else ops.push({ op: 'set', path, value: values.parameters.trim() })
  }
  return ops
}

export function deleteDHOp(name: string): ConfigOp {
  return { op: 'delete', path: pkiDHPath(name) }
}
