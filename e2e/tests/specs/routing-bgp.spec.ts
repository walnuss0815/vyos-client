import { expect, test } from '@playwright/test'
import { commitPendingChanges, login } from './helpers'

/**
 * A real round-trip through `protocols bgp` against the actual VyOS
 * VM: set a local system AS (BGPGlobalSettings.tsx's "System AS"
 * form) and a `redistribute connected` source
 * (BGPNetworksAndRedistribution.tsx's RedistributionSection), commit
 * (safe-apply off, so it's immediate - no confirm step to wait
 * through), then verify both actually landed by reloading the BGP
 * page, which re-fetches GET /api/config/tree fresh - a second,
 * independent call to the real VyOS instance, not just trusting the
 * UI's optimistic state. This proves VyOS's real
 * `protocols bgp system-as <asn>` schema (the newer flat syntax this
 * app targets, not the older `protocols bgp <asn>` container form)
 * and `protocols bgp address-family ipv4-unicast redistribute
 * connected` schema both accept the exact ops bgpGlobalForm.ts
 * generates - real value here since this is FRR-backed config (BGP
 * is implemented by FRR's `bgpd`, not VyOS's own code), and FRR's
 * YANG/CLI validation is notoriously strict about exact syntax.
 *
 * SAFETY: enabling BGP starts `bgpd` for real, but with no neighbor
 * configured it just sits idle listening for connections - it never
 * attempts outbound connections or touches routing/reachability on
 * its own (BGP only acts once a neighbor is configured AND that
 * neighbor actually establishes a session). `65001` is a safe
 * private-use AS per RFC 6996's 16-bit private ASN range
 * (64512-65534). `redistribute connected` is likewise inert with no
 * neighbors: it would only ever advertise the VM's directly-connected
 * routes to an established peer, of which there are none. This test
 * deliberately configures no neighbor at all, unlike
 * static-routes.spec.ts's safe TEST-NET next-hop, since a bare AS
 * number is enough to exercise the FRR schema and there's no need to
 * introduce even a harmless outbound-connection-attempt surface.
 */
test('sets a BGP system AS and redistribute-connected, and they round-trip through a real VyOS commit', async ({
  page,
}) => {
  const systemAs = '65001'

  await login(page)
  await page.goto('/routes/bgp')

  // BGPGlobalSettings.tsx's "System AS *" input - placeholder "64512"
  // doubles as a stable locator since the field starts empty on this
  // fresh VM (no `protocols bgp` configured yet).
  await page.getByLabel('System AS').fill(systemAs)
  await page.getByRole('button', { name: 'Save global settings' }).click()

  // RedistributionSection's "Redistribution source" <select> defaults
  // to 'babel' (BGP_REDISTRIBUTE_SOURCES_IPV4's first entry, see
  // bgpTypes.ts) - explicitly pick 'connected' instead. Scoped to the
  // Redistribution card since NetworksSection right next to it has its
  // own identically-labeled exact "Add" button.
  const redistributionSection = page.locator('div.rounded-xl').filter({ hasText: 'Redistribution' })
  await redistributionSection.getByLabel('Redistribution source').selectOption('connected')
  await redistributionSection.getByRole('button', { name: 'Add', exact: true }).click()

  // Both ops (system-as, redistribute connected) queue together and
  // commit in one round-trip - neither form depends on the other
  // having been committed first.
  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so this re-fetches GET /api/config/tree fresh from the real VM.
  await page.goto('/routes/bgp')
  await expect(page.getByLabel('System AS')).toHaveValue(systemAs)
  // Not `exact: true` - BGPNetworksAndRedistribution.tsx renders the
  // family and source as adjacent text nodes with no space between
  // them ("ipv4" then "connected" immediately after, margin-right is
  // CSS-only), so no single element's normalized text is ever exactly
  // "connected" - it's always concatenated with the family first.
  const redistributionList = page.locator('div.rounded-xl').filter({ hasText: 'Redistribution' }).locator('ul')
  await expect(redistributionList.getByText('connected')).toBeVisible()

  // Cleanup: delete `protocols bgp` entirely via the Config Tree
  // (there's no page-level "disable BGP" shortcut like SnmpPage's -
  // BGPGlobalSettings' own "Save global settings" button is disabled
  // whenever System AS is blank, so it can't be used to remove even
  // just that leaf, let alone the whole subtree). Deleting the whole
  // `protocols bgp` subtree takes the `redistribute connected` op
  // with it too (it lives underneath), leaving the VM with no BGP
  // config at all afterward and `bgpd` no longer running, rather than
  // leaving a bare, harmless-but-pointless config-only daemon for the
  // rest of the shared VM's lifetime.
  await page.goto('/config-tree')
  await page.getByRole('button', { name: '▸ protocols' }).click()

  // TreeNode's Row wrapper for the (non-leaf) `bgp` node - distinct
  // from LeafRow's own wrapper class, so this only matches the one
  // expandable "bgp" row, not any leaf underneath it.
  const bgpRow = page
    .locator('.flex.items-center.justify-between.gap-2.py-1.pl-1.text-sm')
    .filter({ hasText: 'bgp' })
  await bgpRow.getByRole('button', { name: 'Remove' }).click()
  await commitPendingChanges(page)

  await page.goto('/routes/bgp')
  await expect(page.getByLabel('System AS')).toHaveValue('')
})
