import { expect, test } from '@playwright/test'
import { cardWithText, commitPendingChanges, login } from './helpers'

// VyOS caps container network names at 11 characters
// (NetworkForm.tsx's own `tooLong` check, confirmed against vyos-1x's
// interface-definitions/container.xml.in - see containerTypes.ts's doc
// comment) - "E2ETESTNET" (10 chars) fits, following the same
// all-caps convention as dhcp.spec.ts's NETWORK_NAME/policy.spec.ts's
// PREFIX_LIST_NAME.
const NETWORK_NAME = 'E2ETESTNET'
const DESCRIPTION = 'e2e test network - inert, no container attached'

// 172.16.0.0/12 (RFC 1918 private space) is used instead of an
// RFC 5737 TEST-NET block (this suite's usual choice for addresses
// that only ever appear inside route/rule config, never actually
// brought up as a live network) because Podman itself has to accept
// and instantiate this as a real bridge subnet on commit, not just
// store it as an opaque string - picking something outside both
// ranges any locally-running Podman/QEMU networking already uses on
// this VM keeps that instantiation collision-free:
//   - QEMU's own user-mode-networking range, 10.0.2.0/24 (RFC 1918
//     10.0.0.0/8) - the address eth0 itself gets and every other spec's
//     REST-API reachability depends on (see dhcp.spec.ts).
//   - Podman's own default bridge subnet, 10.88.0.0/16 (also inside
//     10.0.0.0/8) - untouched here since no container in this suite is
//     ever created/attached (see this test's own doc comment below).
//   - deploy/container-config-examples/bridge-networking.txt's example
//     network already uses 172.20.0.0/24 - not applied to this VM (it's
//     a doc example, never run by bootstrap.exp), but ".100." is used
//     here instead of ".0." regardless, so the two definitions can't
//     even coincidentally overlap if that example were ever exercised
//     against a real VM too.
const PREFIX_CIDR = '172.20.100.0/24'
const GATEWAY_IP = '172.20.100.1'

/**
 * Creates a brand new `container network` definition - description,
 * an explicit `type bridge`, then a gateway and a prefix added
 * afterward through NetworkList.tsx's generic ChipList UI - committing
 * each step against the real VyOS VM, then reloads and confirms both
 * landed. This is the first real-VyOS proof that this app's
 * hand-modeled `container network` schema (containerNetworkForm.ts/
 * containerParse.ts, built directly against vyos-1x's
 * interface-definitions/container.xml.in per containerTypes.ts's doc
 * comment, not just docs.vyos.io's prose) matches what a real Podman-
 * backed VyOS instance actually accepts - including the `type`
 * discriminated union (`type bridge` is a valueless nested node, not a
 * plain scalar leaf - see containerNetworkFormToOps's doc comment) and
 * the gateway/prefix multi-valued leaves, which - like every other
 * multi-valued leaf in this app - aren't part of the initial creation
 * form at all and only become addable once the network already exists
 * server-side, requiring the same create-commit-reload-then-add-more
 * two-step shape as dhcp.spec.ts's network+static-mapping test.
 *
 * Step 1 also fills in NetworkForm.tsx's optional "Initial prefix"
 * field - a real, this-suite-discovered VyOS requirement: a container
 * network with no prefix at all is rejected at commit time (`prefix
 * for network "..." must be defined!`), and NetworkList.tsx's ChipList
 * (the normal way to add one) can't add a prefix until the network
 * already exists server-side - a deadlock the create form's own
 * optional field exists specifically to avoid (see NetworkForm.tsx and
 * docs/roadmap.md, same pattern as dhcp.spec.ts's "first range"
 * fields).
 *
 * Deliberately does NOT touch container *images* (pull/delete) or
 * create an actual `container name <name>` attached to this network.
 * Image pull/delete is a separate, later addition
 * (docs/architecture.md's "Container images: op-mode, synchronous, and
 * immediate" section) that talks to a dedicated `/container-image`
 * VyOS op-mode endpoint entirely outside `/configure` and this app's
 * pending-changes cart - a fundamentally different code path from
 * every other spec in this suite (immediate, no stage/discard, and a
 * pull can legitimately take minutes) - and pulling a real image also
 * needs the VM to have outbound internet access to a registry, which
 * isn't guaranteed reliable in this QEMU/CI environment and would slow
 * this suite down considerably. That's a good candidate for its own
 * dedicated future spec once in-VM internet reliability is confirmed,
 * not something to fold into this one.
 *
 * Safety: this network definition is entirely standalone - nothing
 * created here ever attaches a `container name <name>` to it (no
 * container is created at all in this spec), and VyOS only actually
 * instantiates the underlying Podman bridge/addressing for a container
 * network when something references it (ContainerNetworkAttachment in
 * containerTypes.ts). So, like firewall.spec.ts's unattached custom
 * chain and policy.spec.ts's unreferenced prefix-list, it's inert by
 * construction: zero effect on real traffic, and it can't touch the
 * eth0/REST API reachability every other spec sharing this VM depends
 * on, regardless of run order.
 */
test('creates a container network with a gateway and prefix, and both round-trip through a real VyOS commit', async ({
  page,
}) => {
  await login(page)

  // --- Step 1: create the network itself (NetworkForm.tsx) ---
  await page.goto('/container/networks')
  await page.getByRole('button', { name: /\+ new network/i }).click()
  await page.getByLabel(/^name/i).fill(NETWORK_NAME)
  await page.getByLabel('Description').fill(DESCRIPTION)
  // '' (the select's default) would leave `type` unset, relying on
  // VyOS's own implicit default bridge behavior - selecting 'bridge'
  // explicitly instead exercises the `type bridge` set-path so this
  // test actually proves that discriminated-union write works against
  // a real VyOS commit, not just the implicit-default path.
  await page.getByLabel(/^type/i).selectOption('bridge')
  await page.getByLabel(/initial prefix/i).fill(PREFIX_CIDR)
  await page.getByRole('button', { name: /queue network creation/i }).click()

  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so NetworksPage's useContainerConfig re-fetches GET /api/config/tree
  // fresh and re-runs containerParse.ts's parseContainerConfig against
  // the real VyOS VM's now-committed config, before adding the gateway
  // on top of it. cardWithText scopes every subsequent query so a
  // same-named label/button elsewhere on the page can't accidentally
  // match.
  await page.goto('/container/networks')
  const networkCard = cardWithText(page, NETWORK_NAME)
  await expect(networkCard).toContainText(DESCRIPTION)
  await expect(networkCard).toContainText('bridge')
  // Not `exact: true` - ChipList.tsx renders each value and its
  // "Remove" button inside the SAME <span> with no separating element
  // (`{value}<button>✕</button>`), so no single element's normalized
  // text is ever exactly the bare value - it's always concatenated
  // with the "✕" glyph too.
  await expect(networkCard.getByText(PREFIX_CIDR)).toBeVisible()

  // --- Step 2: add a gateway (NetworkList.tsx's ChipList) - the
  // prefix ChipList already has the one from step 1's initial-prefix
  // field, so only the gateway is added here. ---
  const gatewayInput = networkCard.getByPlaceholder('192.0.2.1')
  await gatewayInput.fill(GATEWAY_IP)
  await gatewayInput.locator('xpath=..').getByRole('button', { name: 'Add' }).click()

  await commitPendingChanges(page)

  // Reload once more and confirm the description, type, gateway, and
  // prefix are all genuinely present in VyOS's running config - a
  // second, independent fetch from the real VM, not just trusting the
  // UI's optimistic state.
  await page.goto('/container/networks')
  await expect(networkCard).toContainText(DESCRIPTION)
  await expect(networkCard).toContainText('bridge')
  await expect(networkCard.getByText(GATEWAY_IP)).toBeVisible()
  await expect(networkCard.getByText(PREFIX_CIDR)).toBeVisible()
})
