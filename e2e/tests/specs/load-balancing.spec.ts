import { expect, test } from '@playwright/test'
import { cardWithText, commitPendingChanges, login } from './helpers'

// Distinct from run.sh's own API_PORT/UI_PORT defaults (18443/18080)
// and untouched by any other spec in this suite - a purely declarative
// HAProxy service definition, safe to listen on regardless of whether
// anything real ever connects to it.
const FRONTEND_PORT = '8443'
const BACKEND_NAME = 'e2e-haproxy-backend'
const SERVICE_NAME = 'e2e-haproxy-service'
// RFC 5737 TEST-NET-1 - reserved for documentation/testing, guaranteed
// unreachable, so HAProxy just marks this server down harmlessly
// (no health check is configured here, so it isn't even actively
// probed) - never a real target.
const SERVER_NAME = 'placeholder1'
const SERVER_ADDRESS = '192.0.2.1'
const SERVER_PORT = '8080'

/**
 * Creates a new `load-balancing haproxy` backend (with an initial
 * server) and a service (with a port, linked to that backend),
 * committing against the real VyOS VM, then reloads and confirms both
 * landed - a genuine round-trip through VyOS's real HAProxy config
 * schema.
 *
 * HAProxy (not WAN load-balancing, this app's other Load Balancing
 * sub-area) was chosen deliberately: `interfaces wan-load-balance`
 * needs multiple real WAN interfaces with actual health-check targets
 * to be meaningful, and this bootstrap VM only has one real interface
 * (`eth0`) - `WanInterfaceHealthList.tsx`'s own tooltip states "at
 * least one interface must have a health check configured for WAN
 * load-balancing to work at all", which can't be satisfied safely
 * here. HAProxy has no such requirement - a frontend/backend pointed
 * at an unreachable target is simply inert (HAProxy just can't reach
 * it), not something that could destabilize eth0/REST reachability.
 *
 * This needs two commits, not one, for a real reason rooted in VyOS's
 * own validation - and the two commits split along a different line
 * than might be expected. vyos-1x's
 * `src/conf_mode/load-balancing_haproxy.py` `verify()` unconditionally
 * requires the config to have BOTH a `service` and a `backend`
 * (`'Both "service" and "backend" must be configured!'`), AND every
 * backend must already have at least one `server`
 * (`'"<backend> server" must be configured!'`) - and this check runs
 * on the FULL resulting config after every single commit that touches
 * this subtree, not just some eventual final state. That means a
 * backend can NEVER be committed alone before any service exists (or
 * vice versa) - this suite's first attempt at this spec tried exactly
 * that (backend+server committed alone, service added afterward) and
 * VyOS rejected the very first commit with that same "Both ... must be
 * configured!" error, since no service existed yet at that point.
 *
 * So Commit 1 creates BOTH a backend (with `HaproxyBackendFormPanel`'s
 * optional "Initial server" fields, added specifically to satisfy the
 * per-backend server requirement - see docs/roadmap.md) AND a service
 * (with a port) in the same commit - independently valid, but not yet
 * linked to each other (the service form's "Backends" checkbox list is
 * fed from already-fetched config, so a backend created in this same,
 * not-yet-committed batch can't be checked yet). Commit 2 then edits
 * the now-real service to check that now-real backend's box, linking
 * them - the "relationship" step, exactly the same shape as
 * high-availability.spec.ts's two-commit split (valid-but-unlinked
 * state first, the actual relationship second).
 *
 * Safety: `8443` is distinct from run.sh's own `API_PORT`/`UI_PORT`
 * defaults (`18443`/`18080`) and no other spec in this suite touches
 * HAProxy, so there's no possible port collision. `192.0.2.1:8080`
 * (RFC 5737 TEST-NET-1) is guaranteed unreachable, so HAProxy simply
 * can't forward anything there - harmless regardless of what's
 * listening (or not) on the real network.
 */
test('creates an HAProxy backend (with a server) and a service (with a port, linked to that backend), and both round-trip through a real VyOS commit', async ({
  page,
}) => {
  await login(page)

  // --- Commit 1: create the backend (with its initial server) AND the
  // service (with a port), unlinked - both queued before committing
  // once, since VyOS requires both to already exist in the very first
  // commit that touches this subtree at all. ---
  await page.goto('/load-balancing/haproxy')
  await page.getByRole('button', { name: '+ Add backend' }).click()
  await page.getByPlaceholder('app-servers').fill(BACKEND_NAME)
  await page.getByPlaceholder('server name (e.g. app1)').fill(SERVER_NAME)
  await page.getByPlaceholder('10.0.0.5').fill(SERVER_ADDRESS)
  await page.getByPlaceholder('8080').fill(SERVER_PORT)
  await page.getByRole('button', { name: 'Add backend', exact: true }).click()

  await page.getByRole('button', { name: '+ Add service' }).click()
  await page.getByPlaceholder('web').fill(SERVICE_NAME)
  await page.getByPlaceholder('443').fill(FRONTEND_PORT)
  await page.getByRole('button', { name: 'Add service', exact: true }).click()

  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so this re-fetches GET /api/config/tree fresh and re-parses the
  // real VM's now-committed config through loadBalancingParse.ts -
  // this is also what makes the backend selectable in the next step's
  // edit form (its `backends` prop is fed from this same fetch).
  await page.goto('/load-balancing/haproxy')
  const backendCard = cardWithText(page, BACKEND_NAME)
  const serviceCard = cardWithText(page, SERVICE_NAME)
  await expect(backendCard.getByText(`${SERVER_ADDRESS}:${SERVER_PORT}`)).toBeVisible()
  await expect(serviceCard.getByText(`:${FRONTEND_PORT}`)).toBeVisible()

  // --- Commit 2: edit the now-real service to check the now-real
  // backend's box, linking them. ---
  await serviceCard.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('checkbox', { name: BACKEND_NAME }).check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await commitPendingChanges(page)

  // Reload once more and confirm the linkage is genuinely present in
  // VyOS's running config - a second, independent fetch from the real
  // VM, not just trusting the UI's optimistic state.
  await page.goto('/load-balancing/haproxy')
  await expect(serviceCard.getByText(BACKEND_NAME)).toBeVisible()
})
