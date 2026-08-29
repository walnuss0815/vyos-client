import { expect, test } from '@playwright/test'
import { cardWithText, commitPendingChanges, login } from './helpers'

// VyOS prefix-list names follow the same identifier rules as firewall
// custom chains/zones/groups (frontend/src/lib/vyosIdentifier.ts) -
// alphanumeric plus hyphen/underscore - and this app's own fixtures
// use the same uppercase-with-hyphens convention (see
// PrefixListsPage.test.tsx's 'PL4-EXAMPLE').
const PREFIX_LIST_NAME = 'E2E-TEST-PLIST'

// RFC 5737 TEST-NET-3 - documentation/example address space, never
// routable on the real internet, so there's nothing sensitive or
// disruptive about it even before considering that this prefix-list
// is unreferenced (see this test's own doc comment below).
const TEST_PREFIX = '203.0.113.0/24'

/**
 * Creates a brand new IPv4 prefix-list plus a single rule inside it,
 * committing each step against the real VyOS VM, then reloads and
 * confirms both landed - a genuine round-trip through VyOS's *policy
 * prefix-list* schema specifically (a separate nested config subtree
 * from `firewall`/`system`, with its own rule-numbering and
 * ge/le-range syntax - see PrefixListSection.tsx's InfoTooltip), which
 * no other spec in this suite exercises.
 *
 * Safety: `policy prefix-list <name>` is a purely declarative
 * definition - VyOS never evaluates it as a standalone object. It only
 * takes effect when something *references* it: a `policy route-map`
 * rule's `match ip address prefix-list <name>`, or a BGP/OSPF
 * `distribute-list`/`redistribute route-map` pointing at it
 * (PrefixListSection.tsx's own description: "referenced by route-maps
 * and used directly by BGP/OSPF's own redistribution filtering"). This
 * test creates the list and a rule inside it but never wires it up
 * from any route-map, BGP, or OSPF config - so, exactly like
 * firewall.spec.ts's unattached custom chain, it's inert by
 * construction: zero effect on real traffic or routing, meaning it
 * can't break the eth0/REST API reachability that every other e2e
 * test sharing this VM depends on, regardless of run order.
 */
test('creates a prefix-list and a rule inside it, and both round-trip through a real VyOS commit', async ({
  page,
}) => {
  await login(page)

  // --- Step 1: create the prefix-list (PrefixListsPage.tsx / PrefixListSection.tsx) ---
  await page.goto('/policy/prefix-lists')
  // IPv4 tab is already active by default (PrefixListsPage's
  // `useState<PrefixListFamily>('ipv4')`) - nothing to change here.
  await page.getByRole('button', { name: '+ New list' }).click()
  // Both labels render as "Name *" / "Description *" (the `*` marks
  // them required, per PrefixListSection's `valid` check requiring a
  // non-empty, non-taken name and a non-empty description) - getByLabel
  // matches on a substring of the accessible name, so the trailing
  // " *" doesn't need to be included here.
  await page.getByLabel('Name').fill(PREFIX_LIST_NAME)
  await page.getByLabel('Description').fill('e2e test list - unreferenced, inert until attached to a route-map')
  await page.getByRole('button', { name: 'Queue list creation' }).click()

  await commitPendingChanges(page)

  // Reload the list fresh (not just this session's optimistic
  // pending-changes state, which PrefixListSection never merges in
  // anyway - the new list only appears once usePolicyConfig() actually
  // fetches it from the real VM) to confirm VyOS persisted it.
  // cardWithText scopes the rule-add steps below to this list
  // specifically, not any other prefix-list.
  await page.goto('/policy/prefix-lists')
  const listCard = cardWithText(page, PREFIX_LIST_NAME)
  await expect(listCard).toBeVisible()
  await expect(listCard).toContainText('e2e test list - unreferenced, inert until attached to a route-map')

  // --- Step 2: add one rule inside it (PrefixListSection.tsx's RulesSection) ---
  await listCard.getByRole('button', { name: '+ Add rule' }).click()
  await listCard.getByPlaceholder('rule #').fill('10')
  await listCard.locator('select').selectOption('permit')
  // Placeholder is family-dependent ('192.0.2.0/24' for ipv4,
  // '2001:db8::/32' for ipv6) - this list is on the IPv4 tab.
  await listCard.getByPlaceholder('192.0.2.0/24').fill(TEST_PREFIX)
  await listCard.getByRole('button', { name: 'Add', exact: true }).click()

  await commitPendingChanges(page)

  // Reload once more and confirm both the list and the rule inside it
  // are genuinely present in VyOS's running config - a second,
  // independent fetch from the real VM, not just trusting the UI's
  // optimistic state.
  await page.goto('/policy/prefix-lists')
  const committedListCard = cardWithText(page, PREFIX_LIST_NAME)
  await expect(committedListCard).toContainText('#10')
  await expect(committedListCard).toContainText('permit')
  await expect(committedListCard).toContainText(TEST_PREFIX)
})
