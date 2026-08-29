import { expect, test } from '@playwright/test'
import { cardWithText, commitPendingChanges, login } from './helpers'

// RFC 5737 TEST-NET-1 - reserved for documentation/testing, never a
// real allocation, and structurally distinct from the QEMU
// user-mode-networking subnet (10.0.2.0/24) eth0 itself gets its own
// DHCP-assigned address from (see bootstrap.exp) - the address every
// other spec's REST-API reachability depends on. A VRRP `address` is
// assigned to the interface IN ADDITION to whatever real addresses it
// already has, never a replacement (see haTypes.ts's VRRPAddress doc
// comment), so this can't disrupt that DHCP address or reachability.
// VRID 1 with the plain default priority (100) is the least
// interesting possible choice, and not used by any other spec.
const GROUP_NAME = 'E2ETEST'
const INTERFACE = 'eth0'
const VRID = '1'
const PRIORITY = '100'
const VIRTUAL_ADDRESS = '192.0.2.1/24'

/**
 * Creates a new `high-availability vrrp group` bound to eth0 with a
 * test-only virtual address, committing against the real VyOS VM, then
 * reloads and confirms it landed for real - a genuine round-trip
 * through VyOS's *VRRP* schema, which no other spec in this suite
 * touches, exercising the exact `set` ops VrrpGroupList.tsx's
 * VrrpGroupFormPanel/VrrpAddressesSection (via haVrrpForm.ts) generate.
 *
 * This needs two commits, not one - for a real reason rooted in VyOS's
 * own validation, not just this test's own structure. vyos-1x's
 * src/conf_mode/high-availability.py verify() unconditionally requires
 * every `vrrp group` to already have `interface`, `vrid`, AND `address`
 * set, raising `ConfigError('Virtual IP address is required but not
 * set in VRRP group "..."')` for any group missing the last one - but
 * VrrpGroupList.tsx's own "+ Add group" creation form deliberately
 * doesn't collect an address at creation time; an address can only
 * ever be added afterward, through that same group's own "Virtual
 * addresses" section (VrrpAddressesSection), which itself only renders
 * for a group that's already real (i.e. already committed and
 * re-fetched from VyOS, not just locally queued) - so there is no
 * single UI action that can produce a fully-valid new group in one
 * shot. The same verify() function returns immediately, before any of
 * those per-group checks run, whenever `high-availability disable` is
 * set - so this test toggles that top-level flag on for exactly the
 * first commit (which also correctly keeps keepalived stopped rather
 * than transiently starting on an under-specified group), creates the
 * group, then in a second commit adds the address and toggles the flag
 * back off together - so the fully-specified group and the re-enable
 * land in the same validated transaction, exactly as VyOS requires.
 *
 * Safety: see this file's own top-of-file comment for why
 * 192.0.2.1/24, VRID 1, and the default priority can't affect eth0's
 * real address or this app's REST-API reachability. This VM has no
 * other VRRP participant either, so once genuinely enabled (after the
 * second commit) this group simply becomes MASTER for its own virtual
 * address with no peer to negotiate against or fail over to - a
 * harmless, self-contained, real VRRP/keepalived run, not a mock.
 */
test('creates a VRRP group with a virtual address on eth0, and it round-trips through a real VyOS commit', async ({
  page,
}) => {
  await login(page)

  // --- Step 1: create the group (interface/VRID/priority only - no
  // address yet), with `high-availability disable` also set so this
  // incomplete-by-design intermediate state still passes VyOS's
  // commit-time verify() (see this test's own doc comment above) ---
  await page.goto('/high-availability/vrrp')
  // Plain .click(), not .check() - this checkbox's `checked` is bound
  // directly to server-fetched state (VrrpGlobalSettings.tsx), not
  // local component state (queuing an op doesn't optimistically flip
  // it), so Playwright's .check() would wait forever for a visual
  // state change that only happens after a real commit + reload.
  await page.getByRole('checkbox', { name: /disable high availability entirely/i }).click()

  await page.getByRole('button', { name: '+ Add group' }).click()
  await page.getByPlaceholder('OUTSIDE').fill(GROUP_NAME)
  await page.getByPlaceholder('eth0').fill(INTERFACE)
  await page.getByPlaceholder('1-255').fill(VRID)
  await page.getByPlaceholder('100').fill(PRIORITY)
  await page.getByRole('button', { name: 'Add group', exact: true }).click()

  await commitPendingChanges(page)

  // Reload the list fresh (not just this session's optimistic
  // pending-changes state) to confirm VyOS actually persisted the new
  // group - and that it's still globally disabled, as this step
  // intentionally left it. cardWithText scopes repeated queries to
  // this one group's card.
  await page.goto('/high-availability/vrrp')
  await expect(page.getByRole('checkbox', { name: /disable high availability entirely/i })).toBeChecked()
  const groupCard = cardWithText(page, GROUP_NAME)
  await expect(groupCard.getByText(`${INTERFACE} · vrid ${VRID} · priority ${PRIORITY}`)).toBeVisible()

  // --- Step 2: add the virtual address and re-enable High
  // Availability, both in the same commit. VrrpGroupList.tsx renders
  // two VrrpAddressesSection instances per group ("Virtual addresses"
  // then "Excluded addresses"), each with its own independent
  // showAdd/"+ Add address" toggle - scoped via `div:has(> p:text-is
  // (...))` (the section's title <p> is a direct child of its own
  // wrapper div) so the later submit "Add" button search can't also
  // match the *other* section's identically-labeled button once both
  // happen to be open (e.g. on a re-run against a VM that already has
  // a leftover group from an earlier attempt).
  const virtualAddresses = groupCard.locator('div:has(> p:text-is("Virtual addresses"))')
  await virtualAddresses.getByRole('button', { name: '+ Add address' }).click()
  await virtualAddresses.getByPlaceholder('192.0.2.254/24').fill(VIRTUAL_ADDRESS)
  await virtualAddresses.getByRole('button', { name: 'Add', exact: true }).click()
  // Plain .click() again, same reason as step 1's checkbox click above.
  await page.getByRole('checkbox', { name: /disable high availability entirely/i }).click()

  await commitPendingChanges(page)

  // Reload once more and confirm both the address and the re-enabled
  // state are genuinely present in VyOS's running config - a second,
  // independent fetch from the real VM, not just trusting the UI's
  // optimistic state. keepalived is now actually running this group on
  // eth0 (see this test's own doc comment for why that's safe).
  await page.goto('/high-availability/vrrp')
  await expect(page.getByRole('checkbox', { name: /disable high availability entirely/i })).not.toBeChecked()
  await expect(groupCard.getByText(VIRTUAL_ADDRESS, { exact: true })).toBeVisible()
})
