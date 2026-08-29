/**
 * Typed, UI-friendly shapes for a "broader v1" slice of `pki` - see
 * pkiParse.ts for the (pure, unit-tested) functions that convert the
 * raw VyOS JSON tree (as returned by GET /api/config/tree?path=pki)
 * into these shapes, and back into ConfigOp path arrays for the
 * pending-changes cart.
 *
 * PKI is architecturally different from every other area this app
 * covers: real certificate/key *generation* in VyOS (creating a new
 * CA, signing a certificate, generating DH parameters) happens via
 * interactive op-mode commands (`generate pki ca`, `generate pki
 * certificate sign ...`), not the /configure REST endpoint this app
 * uses everywhere else - the CLI prompts for key type/bits/subject
 * fields, prints the result, and only THEN does the resulting PEM
 * material get pasted into the regular config tree via `set`. This
 * app's v1, per explicit product decision made before implementation,
 * is deliberately **storage-only**: pasting in already-obtained PEM
 * certificates/keys (from a CA, ACME, VyOS's own `generate` CLI
 * commands, or elsewhere) and managing their metadata - not a
 * certificate-generation workflow, which would require new backend
 * work wrapping VyOS's op-mode API and complex multi-step UX, unlike
 * every prior area's zero-backend-changes pattern.
 *
 * Confirmed against docs.vyos.io and vyos-1x's own interface-
 * definition XML source (`interface-definitions/pki.xml.in`).
 * Covers, per the "broader v1" decision: Certificate Authorities
 * (`pki ca`), Certificates (`pki certificate`, including ACME
 * auto-renewal fields), Diffie-Hellman parameters (`pki dh`), and
 * generic key-pairs (`pki key-pair`, referenced by WireGuard and
 * other interfaces), plus X.509 default subject fields (`pki x509
 * default` - only meaningful to VyOS's own `generate` CLI flow, but a
 * small flat form, cheap to include). Deliberately Config-Tree-only:
 * `pki openssh` (SSH host keys) and `pki openvpn shared-secret`
 * (OpenVPN-specific, and this app doesn't cover OpenVPN configuration
 * itself yet).
 *
 * Private keys - and, per the existing SSH-public-key precedent (see
 * systemTypes.ts's doc comment), *public* keys too - are masked
 * server-side: the leaf name is always exactly `key` regardless of
 * whether it's under a `public` or `private` node, and
 * shared/sensitive-fields.json's generic `"key"` entry matches on
 * leaf name alone. So PKIKeyPair's publicKey/privateKey are both
 * write-only (`hasPublicKey`/`hasPrivateKey`), the same convention as
 * every other masked leaf in this app - even though a public key
 * isn't actually secret. Certificates, CRLs, and DH parameters are
 * NOT masked (their leaf names - `certificate`, `crl`, `parameters` -
 * don't match any sensitive-fields.json entry, and none of those are
 * actually confidential), so those are shown/edited as plain text.
 */

export interface PKICertificateAuthority {
  name: string
  description?: string
  /** PEM (base64), single-line per VyOS's own convention - not
   * masked, a CA certificate is public. */
  certificate?: string
  /** Write-only - see this file's doc comment. */
  hasPrivateKey: boolean
  passwordProtected: boolean
  /** PEM (base64) CRLs - multi-valued, not masked (a CRL is public). */
  crls: string[]
  /** "Install into CA certificate store on router". */
  systemInstall: boolean
  /** This CA itself is revoked (e.g. an intermediate CA revoked by
   * its parent's CRL) - distinct from the certificates *it* issues
   * being revoked. */
  revoked: boolean
}

export type PKIAcmeRSAKeySize = '2048' | '3072' | '4096'

export interface PKIAcmeSettings {
  domainNames: string[]
  email?: string
  listenAddress?: string
  rsaKeySize?: PKIAcmeRSAKeySize
  url?: string
}

export function blankAcmeSettings(): PKIAcmeSettings {
  return { domainNames: [] }
}

export interface PKICertificate {
  name: string
  description?: string
  /** Not masked - see this file's doc comment. */
  certificate?: string
  /** Write-only. */
  hasPrivateKey: boolean
  passwordProtected: boolean
  revoked: boolean
  acme: PKIAcmeSettings
}

export interface PKIDHParams {
  name: string
  /** Not masked - DH parameters aren't confidential. */
  parameters?: string
}

export interface PKIKeyPair {
  name: string
  /** Write-only - masked despite being public, see this file's doc
   * comment. */
  hasPublicKey: boolean
  /** Write-only. */
  hasPrivateKey: boolean
  passwordProtected: boolean
}

export interface PKIX509Defaults {
  country?: string
  state?: string
  locality?: string
  organization?: string
}

export function blankX509Defaults(): PKIX509Defaults {
  return {}
}

export interface PKIConfig {
  cas: PKICertificateAuthority[]
  certificates: PKICertificate[]
  dhParams: PKIDHParams[]
  keyPairs: PKIKeyPair[]
  x509Defaults: PKIX509Defaults
}
