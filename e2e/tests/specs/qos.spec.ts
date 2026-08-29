import { expect, test } from '@playwright/test'
import { cardWithText, commitPendingChanges, login } from './helpers'

// A generous, effectively non-limiting ceiling for a QEMU virtio-net
// link (whose real throughput is nowhere near 1gbit anyway) - proves
// the bandwidth field round-trips through a real VyOS commit without
// ever meaningfully throttling the tiny amount of REST API traffic
// this shared VM's other specs depend on.
const BANDWIDTH = '1gbit'

/**
 * A real round-trip through VyOS's `qos policy rate-control <name>`
 * (Token Bucket Filter) and `qos interface <ifname> egress <policy>`
 * binding syntax - PoliciesPage.tsx/InterfacesPage.tsx (via
 * useQosConfig()) send/parse these against the actual `qos` config
 * tree, not a fake modeled on it, so this exercises VyOS's real
 * schema for both nodes plus the interface-binding cross-reference
 * between them.
 *
 * `rate-control` is the simplest of this app's 8 supported policy
 * types (RateControlPolicyList.tsx's own doc comment: "a plain Token
 * Bucket Filter, the simplest real rate limiter - no classes, no
 * match rules"): its "Add policy" flow needs only a name, unlike
 * `shaper`/`shaper-hfsc`/`limiter`/`priority-queue`/`round-robin`
 * (which all also need at least one class before they're useful) or
 * `cake`/`fq-codel` (which have several more optional fields than
 * `rate-control`'s bandwidth/burst/latency/description).
 *
 * Two commits, not three: `RateControlPolicyList`'s "Add policy"
 * button only ever queues a bare `set qos policy rate-control <name>`
 * (creating the tagNode) - it can't also queue a `bandwidth` value in
 * the same step, because the edit-fields panel it opens
 * (`RateControlFields`) renders from the *server's* policy list
 * (`useQosConfig()`), which doesn't yet contain this uncommitted
 * policy. So bandwidth can only be set once the bare policy has been
 * committed and re-fetched - this test folds that bandwidth edit into
 * the *second* commit alongside the interface binding, matching the
 * shopping-cart model's actual mechanics rather than fighting them.
 *
 * Safety - why this can't break eth0 reachability for other specs
 * sharing this VM:
 * - `rate-control` is egress-only in this app's own model
 *   (`QosInterfaceBindingsList.tsx`'s `egressPolicies` list includes
 *   it; `ingressPolicies` only ever includes `limiter` policies - VyOS
 *   itself enforces this at commit time, and the UI pre-filters
 *   accordingly). There is no ingress dropdown option to even
 *   accidentally select here.
 * - `1gbit` is far above what a QEMU virtio-net NIC actually carries,
 *   let alone what this app's tiny REST/API traffic needs - it's a
 *   ceiling, not a restriction, so eth0 stays fully reachable for
 *   every subsequent spec regardless of run order.
 * - Nothing is restored afterward (unlike commit.spec.ts's hostname):
 *   no other spec in this suite asserts on the QoS config being
 *   empty, so leaving this policy/binding in place is harmless.
 */
test('creates a QoS rate-control policy, binds it to eth0 egress, and both round-trip through a real VyOS commit', async ({
  page,
}) => {
  const policyName = `e2e-rc-${Date.now()}`

  await login(page)

  // --- Step 1: create the bare policy (PoliciesPage.tsx) ---
  await page.goto('/qos/policies')

  // RateControlPolicyList's own top-level wrapper - scoping to it
  // avoids ambiguity with the seven other policy-type sections
  // (Shaper, Shaper-HFSC, Limiter, Priority Queue, Round Robin, CAKE,
  // FQ-CoDel) that all render "+ Add policy"/"Add policy" buttons too.
  const rateControlSection = page.locator('.mb-8').filter({ hasText: 'Rate control (TBF)' })
  await rateControlSection.getByRole('button', { name: '+ Add policy' }).click()
  await rateControlSection.getByRole('textbox').fill(policyName)
  await rateControlSection.getByRole('button', { name: 'Add policy', exact: true }).click()

  await commitPendingChanges(page)

  // --- Step 2: reload so the bare policy is real (server-fetched),
  // then set its bandwidth and bind it to eth0's egress ---
  await page.goto('/qos/policies')
  const policyRow = cardWithText(page, policyName)
  await policyRow.getByRole('button', { name: 'Edit' }).click()
  await policyRow.getByPlaceholder('bandwidth').fill(BANDWIDTH)
  await policyRow.getByRole('button', { name: 'Save' }).click()

  await page.goto('/qos/interfaces')
  await page.getByRole('button', { name: '+ Add interface' }).click()
  await page.getByPlaceholder('eth0').fill('eth0')

  // Selecting the option itself is what queues
  // `set qos interface eth0 egress <policyName>`
  // (QosInterfaceBindingsList.tsx's BindingRow calls add() straight
  // from the <select>'s onChange) - the "Configure" button next to
  // the name input is just a UI convenience that hides the add panel
  // afterward, it doesn't queue anything on its own.
  //
  // Scoped via the wrapping <label>, not getByLabel('Egress') directly
  // - the page also has an InfoTooltip whose long aria-label text
  // happens to contain the substring "egress" (in "...egress accepts
  // every other policy type"), which getByLabel's case-insensitive
  // substring match would otherwise also match.
  await page.locator('label').filter({ hasText: 'Egress' }).locator('select').selectOption(policyName)

  await commitPendingChanges(page)

  // --- Step 3: reload from scratch and confirm both landed for real ---
  await page.goto('/qos/policies')
  await expect(cardWithText(page, policyName).getByText(BANDWIDTH)).toBeVisible()

  await page.goto('/qos/interfaces')
  const bindingRow = cardWithText(page, 'eth0')
  await expect(bindingRow.getByText('eth0', { exact: true })).toBeVisible()
  await expect(bindingRow.getByLabel('Egress')).toHaveValue(policyName)
  // Explicit confirmation that ingress was never touched.
  await expect(bindingRow.getByLabel('Ingress (limiter only)')).toHaveValue('')
})
