import { expect, test } from '@playwright/test'
import { commitPendingChanges, login } from './helpers'

/**
 * A real round-trip through `protocols static route` against the
 * actual VyOS VM: create a new destination via the Static Routes
 * page's "+ New route" form (family ipv4, via next-hop), commit
 * (safe-apply off, so it's immediate - no confirm step to wait
 * through), then verify the route actually landed by reloading the
 * page, which re-fetches GET /api/config/tree fresh - a second,
 * independent call to the real VyOS instance, not just trusting the
 * UI's optimistic state. This proves VyOS's real
 * `protocols static route <dest> next-hop <addr>` schema accepts the
 * exact `set` op StaticRoutesPage.tsx's `CreateRouteForm.submit()`
 * generates for the "next-hop" via kind.
 *
 * The destination (203.0.113.0/24, RFC 5737 TEST-NET-3) and next-hop
 * (192.0.2.1, RFC 5737 TEST-NET-1) are both reserved documentation
 * ranges from two different TEST-NET blocks - guaranteed never to be
 * routed on the real internet and guaranteed not to collide with the
 * bootstrap VM's only real interface (`eth0`, DHCP-configured on a
 * QEMU user-mode NAT subnet) or its default route. VyOS accepts a
 * static route to an unreachable next-hop at commit time without
 * complaint (the route is simply installed unused - next-hop
 * reachability isn't validated at config-write time), so this is
 * purely a config-write assertion, not a connectivity test.
 */
test('adds a static route and it round-trips through a real VyOS commit', async ({ page }) => {
  const destination = '203.0.113.0/24'
  const nextHop = '192.0.2.1'

  await login(page)
  await page.goto('/routes/static')

  await page.getByRole('button', { name: '+ New route' }).click()
  await page.getByPlaceholder('192.0.2.0/24').fill(destination)
  await page.getByPlaceholder('10.0.0.254').fill(nextHop)
  await page.getByRole('button', { name: 'Queue route creation' }).click()

  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so this re-fetches GET /api/config/tree fresh from the real VM.
  await page.goto('/routes/static')
  await expect(page.getByRole('heading', { name: destination })).toBeVisible()
  await expect(page.getByText(nextHop)).toBeVisible()
})
