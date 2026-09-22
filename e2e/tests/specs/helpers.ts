import { expect, type Locator, type Page } from '@playwright/test'

/** Logs in with the credentials run.sh configured
 * (E2E_UI_ADMIN_USER/E2E_UI_ADMIN_PASSWORD - a real `system login
 * user` account bootstrap.exp creates on the VM itself, with a
 * genuinely VyOS-hashed password, exercising AUTH_MODE=vyos-users
 * end to end), waiting for the redirect to the Dashboard that
 * confirms success. */
export async function login(page: Page): Promise<void> {
  const username = process.env.E2E_UI_ADMIN_USER ?? 'e2elogin'
  const password = process.env.E2E_UI_ADMIN_PASSWORD ?? 'admin'

  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('/')
}

/**
 * Ensures "Safe apply" is off (so Commit applies immediately, no
 * commit-confirm "Keep changes" step to wait through) and commits the
 * currently queued pending changes. "Safe apply" defaults to
 * unchecked on every fresh page load already (PendingChangesBar.tsx's
 * `useState(false)` isn't persisted, but starts in the state this
 * helper wants) - the explicit `.uncheck()` below is a no-op in that
 * common case, kept only as a defensive guard against whatever state
 * it happens to be in (e.g. a spec that deliberately checked it
 * earlier in the same page, without navigating away, before calling
 * this helper).
 *
 * Previously duplicated as a near-identical local
 * `safeApplyCommit`/`commitPendingChanges` function (or inlined
 * outright) in essentially every spec in this suite.
 */
export async function commitPendingChanges(page: Page): Promise<void> {
  await page.getByLabel('Safe apply').uncheck()
  await page.getByRole('button', { name: 'Commit', exact: true }).click()
  await expect(page.getByText(/pending change/)).toHaveCount(0, { timeout: 30_000 })
}

/**
 * The shared Tailwind class list every "card" list item in this app's
 * UI renders with (network/group/backend/ruleset cards, interface
 * cards, etc. - see e.g. NetworkList.tsx, VrrpGroupList.tsx,
 * HaproxyBackendList.tsx). Scopes a query to one specific card by its
 * visible text, rather than matching every card on the page - the
 * class list itself carries no semantic meaning (it's a styling
 * concern, not a testing hook), but it's the only reasonably stable
 * selector available without adding test-ids across the whole
 * component tree.
 *
 * Previously duplicated as an identical literal string across most
 * specs that need to scope an assertion/action to a single card.
 */
export function cardWithText(page: Page, text: string | RegExp): Locator {
  return page.locator('.rounded-xl.border.border-surface-border.bg-surface-900.p-4').filter({ hasText: text })
}
