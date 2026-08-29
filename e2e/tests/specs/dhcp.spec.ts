import { expect, test } from '@playwright/test'
import { cardWithText, commitPendingChanges, login } from './helpers'

// RFC 5737 TEST-NET-1 - reserved for documentation/testing, never a
// real allocation, and structurally can't overlap the QEMU
// user-mode-networking DHCP range eth0 itself gets an address from
// (10.0.2.0/24 - see bootstrap.exp's `set interfaces ethernet eth0
// address dhcp`, the one address every other spec's REST-API
// reachability depends on). "E2ETEST" follows the same
// VYOS_IDENTIFIER_PATTERN-safe, all-caps convention as firewall.spec.ts's
// RULESET_NAME.
const NETWORK_NAME = 'E2ETEST'
const SUBNET_CIDR = '192.0.2.0/24'
const SUBNET_ID = '1'
const RANGE_START = '192.0.2.10'
const RANGE_STOP = '192.0.2.20'

// A static reservation inside that subnet. `MAPPING_IP` is picked well
// outside the dynamic range above (192.0.2.10-192.0.2.20), so it can't
// trip StaticMappingSection.tsx's "falls inside this subnet's own
// dynamic range" warning (isAddressInDynamicRange,
// lib/dhcpPoolUtilization.ts). `MAPPING_MAC` is a QEMU/locally-
// administered-range address (the `52:54:00` OUI QEMU itself uses for
// emulated NICs) - safe and fake, never a real device.
const MAPPING_NAME = 'e2e-test-host'
const MAPPING_IP = '192.0.2.100'
const MAPPING_MAC = '52:54:00:12:34:56'

/**
 * Creates a brand new DHCP shared network with a subnet, then a static
 * mapping (reservation) inside that subnet, committing each step
 * against the real VyOS VM, then reloads and confirms both landed - a
 * genuine round-trip through VyOS's real `service dhcp-server
 * shared-network-name <name> subnet <cidr>` schema, including the
 * nested `static-mapping <name> { mac, ip-address }` container, which
 * is a real risk area given this app's DHCP forms are fairly
 * complex/nested (NetworksPage.tsx -> NetworkCard.tsx -> SubnetCard.tsx
 * -> StaticMappingSection.tsx).
 *
 * The static mapping is added through StaticMappingSection.tsx's own
 * "+ Add mapping" form - not MakeStaticModal.tsx's lease-based "Make
 * static" quick action - since a freshly created subnet on this fresh
 * VM has no live lease yet to promote; StaticMappingSection.tsx's own
 * doc comment confirms both write the exact same config shape from
 * different starting points, so this exercises the manual path that
 * has to work on day one, before any client has ever leased an
 * address.
 *
 * Step 1 also fills in CreateNetworkForm's optional "first range"
 * fields - a real, this-suite-discovered VyOS requirement: a subnet
 * with neither an address range nor a static mapping is rejected at
 * commit time (`No DHCP address range or active static-mapping
 * configured...`), and RangeList/StaticMappingSection can't add either
 * one until the subnet already exists server-side - a deadlock the
 * create form's own optional range fields exist specifically to avoid
 * (see NetworksPage.tsx's CreateNetworkForm and docs/roadmap.md).
 *
 * Step 0 gives eth0 a SECONDARY static address in the same test
 * subnet (192.0.2.1/24, via AddressChips - see interfaces.spec.ts for
 * the same component) - another real, this-suite-discovered VyOS
 * requirement: `service dhcp-server` also rejects a subnet that
 * doesn't correspond to any real interface's own address at all
 * (`None of the configured subnets have an appropriate primary IP
 * address on any broadcast interface configured...`), and this app has
 * no `listen-address` override for that (see dhcpConfigTypes.ts's own
 * doc comment on what's intentionally not covered).
 *
 * Safety: 192.0.2.0/24 is RFC 5737 TEST-NET-1, permanently reserved
 * for documentation/testing and never a real allocation, so it cannot
 * collide with anything real. It's also structurally distinct from
 * the QEMU user-mode-networking range (10.0.2.0/24) eth0's own
 * DHCP-assigned address comes from (see bootstrap.exp) - the address
 * this whole suite's REST-API reachability depends on. Adding
 * 192.0.2.1/24 as a SECONDARY address is additive, not a replacement -
 * VyOS interfaces natively support multiple `address` values
 * (AddressChips.tsx), so eth0's real DHCP address/route is untouched
 * and every other spec sharing this VM keeps working regardless of
 * run order.
 */
test('creates a DHCP shared network/subnet and a static mapping inside it, and both round-trip through a real VyOS commit', async ({
  page,
}) => {
  await login(page)

  // --- Step 0: give eth0 a secondary address in the test subnet (AddressChips) ---
  // Queued immediately (AddressChips doesn't batch behind its own
  // submit button - see its own doc comment), so it rides along with
  // step 1's ops in the same first commit below. Scoped to eth0's own
  // card (same locator interfaces.spec.ts uses) since VlanSection right
  // below AddressChips on the same card has its own "Add" button too.
  await page.goto('/interfaces/ethernet')
  const eth0Card = cardWithText(page, 'eth0')
  await eth0Card.getByPlaceholder('192.0.2.1/24').fill('192.0.2.1/24')
  await eth0Card.getByRole('button', { name: 'Add', exact: true }).click()

  // --- Step 1: create the shared network + its first subnet (NetworksPage.tsx) ---
  await page.goto('/dhcp/networks')
  await page.getByRole('button', { name: /new network/i }).click()
  await page.getByLabel('Name').fill(NETWORK_NAME)
  await page.getByLabel('First subnet CIDR').fill(SUBNET_CIDR)
  await page.getByLabel('Subnet ID').fill(SUBNET_ID)
  await page.getByLabel(/first range start/i).fill(RANGE_START)
  await page.getByLabel(/first range stop/i).fill(RANGE_STOP)
  await page.getByRole('button', { name: /queue network creation/i }).click()

  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so NetworksPage's useDHCPConfig re-fetches GET /api/config/tree
  // fresh and re-runs dhcpConfigParse.ts's parseSharedNetworks against
  // the real VyOS VM's now-committed config, before building the
  // static mapping on top of it. cardWithText scopes every subsequent
  // query so a same-named label/button elsewhere on the page can't
  // accidentally match.
  await page.goto('/dhcp/networks')
  const networkCard = cardWithText(page, NETWORK_NAME)
  await expect(networkCard.getByText(SUBNET_CIDR, { exact: true })).toBeVisible()
  await expect(networkCard.getByText(`${RANGE_START} – ${RANGE_STOP}`)).toBeVisible()

  // --- Step 2: add a static mapping inside that subnet (StaticMappingSection.tsx) ---
  await networkCard.getByRole('button', { name: '+ Add mapping' }).click()
  await networkCard.getByLabel('Name').fill(MAPPING_NAME)
  await networkCard.getByLabel('IP address').fill(MAPPING_IP)
  await networkCard.getByLabel('MAC address').fill(MAPPING_MAC)
  await networkCard.getByRole('button', { name: /queue new mapping/i }).click()

  await commitPendingChanges(page)

  // Reload once more and confirm the subnet and the static mapping
  // inside it are genuinely present in VyOS's running config - a
  // second, independent fetch from the real VM, not just trusting the
  // UI's optimistic state.
  await page.goto('/dhcp/networks')
  await expect(networkCard.getByText(SUBNET_CIDR, { exact: true })).toBeVisible()
  await expect(networkCard.getByText(MAPPING_NAME, { exact: true })).toBeVisible()
  await expect(networkCard.getByText(MAPPING_IP, { exact: true })).toBeVisible()
  await expect(networkCard.getByText(MAPPING_MAC, { exact: true })).toBeVisible()
})
