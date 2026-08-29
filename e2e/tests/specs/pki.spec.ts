import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { commitPendingChanges, login } from './helpers'

const CERT_NAME = 'e2e-test-cert'
const CERT_VALIDITY_DAYS = 3650

let certDerBase64: string
let privateKeyDerBase64: string
let expectedExpiryYear: number

/**
 * Generates a throwaway, no-value self-signed test certificate (CN=
 * e2e-test, 2048-bit RSA, ~10-year validity) fresh in a temp directory
 * for every run, rather than embedding real X.509/RSA DER bytes
 * literally in this source file - deliberately, so nothing
 * key-shaped ever sits in version control, even harmless-in-practice
 * throwaway test material (a private security scan flagged the
 * previous hardcoded version as exactly the kind of thing automated
 * secret scanners - GitHub secret scanning, gitleaks, TruffleHog -
 * commonly false-positive on, regardless of how thoroughly it's
 * documented as inert).
 *
 * `openssl` is already an implicit dependency of this whole e2e suite
 * (run.sh/dev-vm.sh already call `openssl rand` for the API key/login
 * password) - this just relies on it more heavily, for real key/cert
 * generation and format conversion, not just randomness. See
 * e2e/README.md's "Requires" line.
 *
 * The three steps mirror the exact manual process this file used to
 * document generating the fixture with:
 *   openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem \
 *     -out cert.pem -days 3650 -subj "/CN=e2e-test"
 *   openssl x509 -in cert.pem -outform DER | base64 -w0
 *   openssl rsa  -in key.pem  -outform DER | base64 -w0
 * - the last two `| base64` pipes are replaced with Node's own
 *   `Buffer.toString('base64')` on the raw DER bytes instead of
 *   shelling out to a separate `base64` binary, which is also more
 *   portable (`-w0` is a GNU-coreutils-specific flag, not universally
 *   available - Node's own base64 encoding has no such platform
 *   dependency).
 */
test.beforeAll(() => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'vyos-client-pki-'))
  const keyPemPath = join(tmpDir, 'key.pem')
  const certPemPath = join(tmpDir, 'cert.pem')
  const certDerPath = join(tmpDir, 'cert.der')
  const keyDerPath = join(tmpDir, 'key.der')

  // openssl writes its own progress noise (key-generation dots,
  // "writing RSA key") to stderr by default - captured (not printed
  // live) rather than fully discarded, so it's still available for
  // debugging via the thrown error's own output if any of these ever
  // fail, without cluttering every normal test run's console output.
  const opensslOpts = { stdio: ['ignore', 'ignore', 'pipe'] } as const

  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPemPath,
        '-out',
        certPemPath,
        '-days',
        String(CERT_VALIDITY_DAYS),
        '-subj',
        '/CN=e2e-test',
      ],
      opensslOpts,
    )

    // `openssl x509`/`openssl rsa` (as opposed to the more generic
    // `openssl pkey`) always read/write PKCS1-flavored RSA structures
    // regardless of the input key's own wrapping (modern OpenSSL's
    // `req -newkey rsa:...` defaults to a PKCS8-wrapped key) - this is
    // what performs the real PKCS8->PKCS1 reformatting the app's
    // "Private key" field expects (see pkiTypes.ts's doc comment: its
    // placeholder example, "MIIE...", is a PKCS1-shaped prefix), not
    // just a PEM-armor-stripping no-op.
    execFileSync('openssl', ['x509', '-in', certPemPath, '-outform', 'DER', '-out', certDerPath], opensslOpts)
    execFileSync('openssl', ['rsa', '-in', keyPemPath, '-outform', 'DER', '-out', keyDerPath], opensslOpts)

    certDerBase64 = readFileSync(certDerPath).toString('base64')
    privateKeyDerBase64 = readFileSync(keyDerPath).toString('base64')
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  // `-days 3650` is measured from generation time, not a fixed
  // calendar date - compute the real expected expiry year instead of
  // hardcoding one, so this test stays correct regardless of which
  // year it actually runs in.
  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + CERT_VALIDITY_DAYS)
  expectedExpiryYear = expiryDate.getFullYear()
})

/**
 * A real round-trip through this app's PKI storage form against the
 * actual VyOS VM: queue a new `pki certificate` with genuine X.509 DER
 * bytes (not a fixture/mock) via the "New certificate" form, commit
 * (safe-apply off), then verify against the live VM in two
 * independent ways:
 *
 * 1. The certificate is actually stored and VyOS's own config schema
 *    accepted these real DER-as-base64 bytes through this app's
 *    `certificateFormToOps` -> `/configure set` pipeline - not just
 *    that the UI *thinks* it queued something.
 * 2. Reloading re-fetches GET /api/pki/expiry fresh, which drives the
 *    backend's real `crypto/x509.ParseCertificate` (see
 *    backend/internal/api/pki_handlers.go) against the exact bytes
 *    VyOS is now storing for this certificate - so the expiry badge
 *    showing the certificate's real ~10-year `NotAfter` cross-
 *    validates that parsing pipeline end to end against a genuinely
 *    VyOS-stored certificate, the one thing the unit tests (which
 *    only ever exercise it against mocked bytes) can't.
 *
 * Also spot-checks masking.spec.ts's pattern against PKI data
 * specifically: per pkiTypes.ts's doc comment, a certificate's public
 * `certificate` value is deliberately NOT masked (it's public data),
 * but the `private key` we set alongside it very much is - its leaf
 * name is exactly `key`, matching shared/sensitive-fields.json's
 * generic entry - so the Config Tree's "Set commands" view must still
 * show `••••••••` for it, never the real key bytes.
 */
test('adds a real certificate to the VM, shows its parsed expiry, and masks its private key', async ({
  page,
}) => {
  await login(page)
  await page.goto('/pki/certificates')

  await page.getByRole('button', { name: /\+ new certificate/i }).click()
  await page.getByLabel(/^name/i).fill(CERT_NAME)
  await page.getByLabel(/^certificate/i).fill(certDerBase64)
  // getByRole('textbox', ...) rather than getByLabel - the form also
  // has an unrelated "Private key is password-protected" checkbox
  // whose accessible name also starts with "Private key", which
  // getByLabel's substring/regex match would otherwise match too.
  await page.getByRole('textbox', { name: /^private key/i }).fill(privateKeyDerBase64)
  await page.getByRole('button', { name: /queue certificate creation/i }).click()

  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so this re-fetches both GET /api/config/tree?path=pki and GET
  // /api/pki/expiry fresh from the real VyOS VM.
  await page.goto('/pki/certificates')
  const card = page.locator('.rounded-xl').filter({ hasText: CERT_NAME })
  await expect(card.getByText(CERT_NAME, { exact: true })).toBeVisible()

  // ExpiryBadge.tsx renders a plain "expires <date>" note (as opposed
  // to its amber "expiring soon"/red "expired" variants) once the
  // parsed NotAfter is comfortably beyond its 30-day threshold - true
  // here since the real cert is valid ~10 years out (see beforeAll).
  // The exact date format is locale-dependent (Date.toLocaleDateString()
  // with no explicit locale), so this only asserts on the real year,
  // which is locale-independent.
  await expect(card.getByText(new RegExp(`expires.*${expectedExpiryYear}`, 'i'))).toBeVisible()

  // Cross-check the masking behavior against the real VyOS config.
  await page.goto('/config-tree')
  await page.getByRole('button', { name: 'Set commands' }).click()

  const commands = page.locator('pre')
  // No quotes around the name itself - only values get quoted in the
  // rendered set-commands text (`pki certificate <name> private key
  // '<value>'`), matching VyOS's own convention.
  await expect(commands).toContainText(`pki certificate ${CERT_NAME} private key`)
  await expect(commands).toContainText('••••••••')
  await expect(commands).not.toContainText(privateKeyDerBase64)
})
