import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('logs in and shows real data from the VyOS VM on the Dashboard', async ({ page }) => {
  await login(page)

  // The live-ISO default hostname, and the VyOS version card showing
  // some real value fetched live from the VM (not the '…' loading/
  // error placeholder DashboardPage.tsx falls back to) - a real
  // round-trip through vyos.Client.Info against the actual VM, not a
  // mock. Scoped to <main> (the Dashboard's Hostname card) since the
  // sidebar header also shows the hostname - both are correct, but
  // asserting on the whole page would be an ambiguous match.
  //
  // Deliberately not asserting the exact version *string* here (this
  // used to check for a literal "rolling" substring): this suite runs
  // against multiple VyOS channels/releases - the current rolling
  // build and the last 4 VyOS Stream releases (see e2e/README.md's
  // "Which VyOS builds are tested") - each reporting a differently
  // formatted version string, and this test has no reason to know or
  // care which one is currently pinned.
  await expect(page.getByRole('main').getByText('vyos', { exact: true })).toBeVisible()
  const versionCard = page.getByRole('main').getByText('VyOS version').locator('..')
  await expect(versionCard).not.toContainText('…')

  // AUTH_MODE=vyos-users specific: the session's identity should be
  // the real `system login user` account bootstrap.exp created (see
  // helpers.ts), not some hardcoded/static value - proving the whole
  // real-hash-verification pipeline actually determined *who* logged
  // in, not just *that* someone did. Scoped to the sidebar
  // (role=complementary, the <aside>) which is the only place that
  // renders it.
  const loginUser = process.env.E2E_UI_ADMIN_USER ?? 'e2elogin'
  await expect(page.getByRole('complementary').getByText(loginUser, { exact: true })).toBeVisible()
})

test('rejects a wrong password', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill(process.env.E2E_UI_ADMIN_USER ?? 'e2elogin')
  await page.getByLabel('Password').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toContainText(/invalid username or password/i)
  // Still on the login page - never redirected to the Dashboard.
  await expect(page).toHaveURL(/\/login$/)
})
