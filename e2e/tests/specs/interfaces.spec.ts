import { expect, test } from '@playwright/test'
import { cardWithText, commitPendingChanges, login } from './helpers'

/**
 * A real round-trip through the commit pipeline against the actual
 * VyOS VM: edit eth0's `description` via the Ethernet interfaces
 * page, commit (safe-apply off, so it's immediate - no confirm step
 * to wait through), then verify the change actually landed by
 * reloading the page, which re-fetches `GET /api/config/tree?path=interfaces`
 * fresh - a second, independent call to the real VyOS instance, not
 * just trusting the UI's optimistic state.
 *
 * `description` is deliberately the field under test here, not
 * `address`/MTU/VRF/disable: it's the only field on this form that's
 * purely cosmetic (`set interfaces ethernet eth0 description "..."`)
 * and can't affect connectivity. eth0 is the sole interface
 * bootstrap.exp DHCP-configures for the QEMU hostfwd mapping the REST
 * API (and this whole suite) depends on - mutating anything else on
 * it could break reachability for every subsequent spec sharing this
 * one VM.
 */
test('edits and commits eth0 description, and it round-trips through a real VyOS commit', async ({
  page,
}) => {
  const newDescription = `e2e test description ${Date.now()}`

  await login(page)
  await page.goto('/interfaces/ethernet')

  // EthernetCard's outer wrapper - scoping to it (rather than bare
  // page-level getByRole/getByLabel) keeps this robust if the
  // bootstrap VM ever grows a second interface alongside eth0.
  const eth0Card = cardWithText(page, 'eth0')
  await eth0Card.getByRole('button', { name: 'Edit' }).click()
  await eth0Card.getByLabel('Description').fill(newDescription)
  await eth0Card.getByRole('button', { name: 'Queue changes' }).click()

  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so this re-fetches the interfaces config-tree query fresh.
  await page.goto('/interfaces/ethernet')
  await expect(page.getByText(newDescription)).toBeVisible()
})
