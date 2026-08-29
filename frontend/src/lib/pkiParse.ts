import {
  blankAcmeSettings,
  blankX509Defaults,
  type PKIAcmeRSAKeySize,
  type PKICertificate,
  type PKICertificateAuthority,
  type PKIConfig,
  type PKIDHParams,
  type PKIKeyPair,
  type PKIX509Defaults,
} from './pkiTypes'

// --- generic VyOS JSON-tree helpers -------------------------------------
// (deliberately duplicated, not shared - see bgpParse.ts's/ospfParse.ts's/
// natParse.ts's/policyParse.ts's own copy of this comment for why this
// matches the rest of the codebase.)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  return String(v)
}

function child(node: unknown, key: string): unknown {
  if (!isRecord(node)) return undefined
  return node[key]
}

function isFlagPresent(node: unknown, key: string): boolean {
  return isRecord(node) && key in node
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') return [v]
  return []
}

// --- certificate authorities -----------------------------------------

function parseCA(name: string, raw: unknown): PKICertificateAuthority {
  const privateRoot = child(raw, 'private')
  return {
    name,
    description: asString(child(raw, 'description')),
    certificate: asString(child(raw, 'certificate')),
    hasPrivateKey: child(privateRoot, 'key') !== undefined,
    passwordProtected: isFlagPresent(privateRoot, 'password-protected'),
    crls: asStringArray(child(raw, 'crl')),
    systemInstall: isFlagPresent(raw, 'system-install'),
    revoked: isFlagPresent(raw, 'revoke'),
  }
}

function parseCAs(root: unknown): PKICertificateAuthority[] {
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([name, raw]) => parseCA(name, raw))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- certificates ------------------------------------------------------

function parseCertificate(name: string, raw: unknown): PKICertificate {
  const privateRoot = child(raw, 'private')
  const acmeRoot = child(raw, 'acme')
  return {
    name,
    description: asString(child(raw, 'description')),
    certificate: asString(child(raw, 'certificate')),
    hasPrivateKey: child(privateRoot, 'key') !== undefined,
    passwordProtected: isFlagPresent(privateRoot, 'password-protected'),
    revoked: isFlagPresent(raw, 'revoke'),
    acme: isRecord(acmeRoot)
      ? {
          domainNames: asStringArray(child(acmeRoot, 'domain-name')),
          email: asString(child(acmeRoot, 'email')),
          listenAddress: asString(child(acmeRoot, 'listen-address')),
          rsaKeySize: asString(child(acmeRoot, 'rsa-key-size')) as PKIAcmeRSAKeySize | undefined,
          url: asString(child(acmeRoot, 'url')),
        }
      : blankAcmeSettings(),
  }
}

function parseCertificates(root: unknown): PKICertificate[] {
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([name, raw]) => parseCertificate(name, raw))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- DH params / key-pairs ------------------------------------------

function parseDHParams(root: unknown): PKIDHParams[] {
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([name, raw]) => ({ name, parameters: asString(child(raw, 'parameters')) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function parseKeyPair(name: string, raw: unknown): PKIKeyPair {
  const privateRoot = child(raw, 'private')
  return {
    name,
    hasPublicKey: child(child(raw, 'public'), 'key') !== undefined,
    hasPrivateKey: child(privateRoot, 'key') !== undefined,
    passwordProtected: isFlagPresent(privateRoot, 'password-protected'),
  }
}

function parseKeyPairs(root: unknown): PKIKeyPair[] {
  if (!isRecord(root)) return []
  return Object.entries(root)
    .map(([name, raw]) => parseKeyPair(name, raw))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- x509 defaults -----------------------------------------------------

function parseX509Defaults(pki: unknown): PKIX509Defaults {
  const defaultRoot = child(child(pki, 'x509'), 'default')
  if (defaultRoot === undefined) return blankX509Defaults()
  return {
    country: asString(child(defaultRoot, 'country')),
    state: asString(child(defaultRoot, 'state')),
    locality: asString(child(defaultRoot, 'locality')),
    organization: asString(child(defaultRoot, 'organization')),
  }
}

// --- top level -------------------------------------------------------------

export function parsePKIConfig(pki: unknown): PKIConfig {
  return {
    cas: parseCAs(child(pki, 'ca')),
    certificates: parseCertificates(child(pki, 'certificate')),
    dhParams: parseDHParams(child(pki, 'dh')),
    keyPairs: parseKeyPairs(child(pki, 'key-pair')),
    x509Defaults: parseX509Defaults(pki),
  }
}

// --- path builders -----------------------------------------------------

export function pkiCAPath(name: string, ...rest: string[]): string[] {
  return ['pki', 'ca', name, ...rest]
}

export function pkiCertificatePath(name: string, ...rest: string[]): string[] {
  return ['pki', 'certificate', name, ...rest]
}

export function pkiDHPath(name: string, ...rest: string[]): string[] {
  return ['pki', 'dh', name, ...rest]
}

export function pkiKeyPairPath(name: string, ...rest: string[]): string[] {
  return ['pki', 'key-pair', name, ...rest]
}

export function pkiX509DefaultsPath(...rest: string[]): string[] {
  return ['pki', 'x509', 'default', ...rest]
}
