import { expect, test } from '@playwright/test'
import { commitPendingChanges, login } from './helpers'

const NEW_USERNAME = 'e2etestuser'
const NEW_FULL_NAME = 'E2E Test User'
// Real, not a placeholder - VyOS itself one-way hashes this into a
// genuine `encrypted-password` on commit (same as the login account
// bootstrap.exp creates - see helpers.ts's login()), so this exercises
// vyos-client's plaintext-password -> VyOS-hashing path a second time,
// for a user this suite creates and controls itself. Deliberately has
// a password set (not left blank) so the config-warnings engine's
// `user-no-auth-{username}` rule (added earlier this session - see
// configWarningRules.json) does NOT flag this user: the point here is
// a real, valid, authenticated-capable account, not a warning fixture.
const NEW_PASSWORD = 'E2eTest-Password-123!'

/**
 * Creates a brand-new `system login user` (username + password + full
 * name) through the UI, commits it, and confirms two things against
 * the real VyOS VM - not mocked data:
 *
 * 1. The user genuinely landed in VyOS's config: reloading the Users
 *    page re-fetches GET /api/config/tree fresh and the new
 *    username/full-name are visible for real, proving this app's
 *    generated `set system login user <name> ...` syntax (including
 *    `authentication plaintext-password`) is accepted as-is by VyOS's
 *    actual `system_login` interface definition/schema and hashed
 *    into a real `encrypted-password` on commit - not just accepted
 *    by this project's own hand-modeled fake VyOS server.
 * 2. The plaintext password is never exposed back anywhere in the UI
 *    against that real, committed config - reusing masking.spec.ts's
 *    exact pattern (the Config Tree's "Set commands" flat dump,
 *    sourced from the real VM) to assert the `authentication
 *    encrypted-password` leaf shows the masked `••••••••` placeholder
 *    and the raw password string never appears in that dump.
 *
 * Deliberately only ADDS a new, separate user - never touches,
 * renames, disables, or deletes the account this test itself just
 * used to log in (see helpers.ts's login()), which every other spec
 * in this suite also depends on being able to log in with.
 */
test('creates a new system login user with a password, and it round-trips through a real VyOS commit without ever exposing the password', async ({
  page,
}) => {
  await login(page)
  await page.goto('/system/users')

  // "+ New user" toggles UserForm open (see UserList.tsx) - exact text,
  // no other button on this page matches it.
  await page.getByRole('button', { name: '+ New user' }).click()

  // UserForm's Username/Full name/Password fields are plain <label>s
  // (Full name via the shared FieldLabel component for Password) -
  // getByLabel resolves them by their implicit label association, no
  // explicit id/htmlFor needed. "^password" anchors to the start so it
  // doesn't also match "Full name" or anything else.
  await page.getByLabel(/username/i).fill(NEW_USERNAME)
  await page.getByLabel('Full name').fill(NEW_FULL_NAME)
  await page.getByLabel(/^password/i).fill(NEW_PASSWORD)

  // UserForm's submit button reads "Queue user creation" while
  // creating (vs. "Save changes" when editing) - only pushes a
  // pending-changes op, doesn't touch VyOS yet.
  await page.getByRole('button', { name: 'Queue user creation' }).click()

  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so this re-fetches GET /api/config/tree fresh from the real VM.
  await page.goto('/system/users')
  await expect(page.getByText(NEW_USERNAME, { exact: true })).toBeVisible()
  // Not exact: UserList renders full name and (since this user has a
  // password) a trailing "· password set" note in the same <p>, so
  // its full text isn't NEW_FULL_NAME alone - a substring match is
  // still a genuine assertion that the real full name is present.
  await expect(page.getByText(NEW_FULL_NAME)).toBeVisible()

  // The raw password must never appear on the page that just created
  // it either, not just in the Config Tree checked below.
  await expect(page.getByText(NEW_PASSWORD)).toHaveCount(0)

  // Same masking assertion as masking.spec.ts, against this same
  // real VM: the "Set commands" view is a flat text dump of the
  // entire (masked) running config, sourced from the actual VyOS VM's
  // config - not a fixture. The new user's `authentication
  // encrypted-password` leaf (VyOS's own hash of NEW_PASSWORD,
  // produced during the commit above) must show the masked
  // `••••••••` placeholder, and the raw password must never appear in
  // this dump.
  await page.goto('/config-tree')
  await page.getByRole('button', { name: 'Set commands' }).click()

  const commands = page.locator('pre')
  await expect(commands).toContainText(`system login user ${NEW_USERNAME} authentication encrypted-password`)
  await expect(commands).toContainText('••••••••')
  await expect(commands).not.toContainText(NEW_PASSWORD)
})
