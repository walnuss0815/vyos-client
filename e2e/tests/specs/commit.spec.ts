import { expect, test, type Page } from '@playwright/test'
import { commitPendingChanges, login } from './helpers'

const ORIGINAL_HOSTNAME = 'vyos' // the live-ISO default

/**
 * A real round-trip through the commit pipeline against the actual
 * VyOS VM: edit `system host-name` via the Config Tree, commit
 * (safe-apply off, so it's immediate - no confirm step to wait
 * through), then verify the change actually landed by reloading the
 * Dashboard, which re-fetches GET /api/system/info fresh - a second,
 * independent call to the real VyOS instance, not just trusting the
 * UI's optimistic state. Restores the original hostname at the end so
 * this test doesn't leave the shared VyOS VM (and other specs, which
 * assert on the live-ISO default hostname) mutated regardless of test
 * run order.
 */
test('edits and commits system host-name, and it round-trips through a real VyOS commit', async ({
  page,
}) => {
  const newHostname = `e2e-${Date.now()}`

  await login(page)
  await editAndCommitHostname(page, newHostname)
  await editAndCommitHostname(page, ORIGINAL_HOSTNAME)
})

async function editAndCommitHostname(page: Page, newValue: string) {
  await page.goto('/config-tree')

  // TreeNode's expand/collapse toggle button's accessible name is the
  // triangle glyph plus the segment name together (they're both inside
  // the same <button>), not just the segment name alone - "▸" when
  // collapsed (its initial state after this fresh navigation, since
  // only the root's direct children are auto-expanded).
  await page.getByRole('button', { name: '▸ system' }).click()

  // LeafRow's outer wrapper - not just the inner row div - since the
  // edit input/Queue button only appear in a sibling div under this
  // outer one once editing starts, not inside the row div itself.
  const hostNameRow = page.locator('.flex.flex-col.gap-1.py-1.pl-1').filter({ hasText: 'host-name' })
  await hostNameRow.getByRole('button', { name: 'Edit' }).click()
  await hostNameRow.getByRole('textbox').fill(newValue)
  await hostNameRow.getByRole('button', { name: 'Queue' }).click()

  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so this re-fetches GET /api/system/info fresh. Scoped to <main>
  // since the sidebar header also shows the hostname.
  await page.goto('/')
  await expect(page.getByRole('main').getByText(newValue, { exact: true })).toBeVisible()
}
