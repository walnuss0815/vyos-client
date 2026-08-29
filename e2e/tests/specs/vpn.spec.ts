import { expect, test } from '@playwright/test'
import { cardWithText, commitPendingChanges, login } from './helpers'

// Deliberately test-only, unambiguous name - won't collide with
// anything a real deployment would name a crypto proposal set.
const GROUP_NAME = 'E2E-TEST-ESP'

/**
 * Creates an IPsec ESP group (a standalone crypto proposal set - `vpn
 * ipsec esp-group <name> proposal <n> encryption/hash`) with one
 * proposal, committing each step against the real VyOS VM, then
 * reloads and confirms both landed. ESP group is the simplest VPN
 * sub-area to validate for real: unlike site-to-site or remote-access
 * IPsec (which need an actual remote peer to establish a tunnel - out
 * of scope for this VM-only suite), a crypto proposal group is only
 * ever consulted by something that references it via `esp-group
 * <name>` on an actual peer/tunnel.
 *
 * Safety: this test never creates a peer or tunnel, and never
 * references `E2E-TEST-ESP` from anywhere - so it has zero effect on
 * the running system, the same "inert by construction" argument
 * firewall.spec.ts makes for its own unattached custom chain. This
 * only proves VyOS's real `vpn ipsec esp-group` schema accepts this
 * app's exact generated `set`/`delete` syntax for the encryption/hash
 * proposal fields, the same thing the fake VyOS server in the
 * backend/frontend unit suites can only assume.
 */
test('creates an IPsec ESP group with a proposal, and it round-trips through a real VyOS commit', async ({
  page,
}) => {
  await login(page)

  // --- Step 1: create the group (IpsecCryptoGroups.tsx's EspGroupForm) ---
  await page.goto('/vpn/ipsec-crypto')
  await page.getByRole('button', { name: '+ New ESP group' }).click()
  // Leave Mode/PFS/lifetime all blank - EspGroupForm queues zero ops
  // for untouched fields (espGroupFormToOps), so the only op is the
  // bare group creation; VyOS applies its own documented defaults
  // (tunnel / pfs enable) for anything left unset.
  await page.getByLabel('Name *').fill(GROUP_NAME)
  await page.getByRole('button', { name: 'Queue creation' }).click()

  await commitPendingChanges(page)

  // Reload the list fresh (not just this session's optimistic
  // pending-changes state) to confirm VyOS actually persisted the new
  // group before adding a proposal to it - EspGroupForm/EspProposals
  // only render proposal-add UI for a group that's actually present
  // in the fetched config (no optimistic merge of pending ops into
  // the displayed list - see useVpnConfig.ts).
  await page.goto('/vpn/ipsec-crypto')
  const groupCard = cardWithText(page, GROUP_NAME)
  await expect(groupCard).toBeVisible()

  // --- Step 2: add one proposal inside it (EspProposals) ---
  // A standard, unremarkable combination confirmed present in this
  // form's actual <select> options (IPSEC_ENCRYPTION_CIPHERS and
  // IPSEC_HASH_ALGORITHMS in lib/vpnIpsecTypes.ts), not guessed.
  await groupCard.getByRole('button', { name: 'Proposals' }).click()
  await groupCard.getByRole('button', { name: '+ Add proposal' }).click()
  await groupCard.getByPlaceholder('priority #').fill('1')
  await groupCard.getByRole('combobox').nth(0).selectOption('aes256') // encryption
  await groupCard.getByRole('combobox').nth(1).selectOption('sha256') // hash
  await groupCard.getByRole('button', { name: 'Add proposal' }).click()

  await commitPendingChanges(page)

  // Reload once more and confirm both the group and its proposal are
  // genuinely present in VyOS's running config - a second, independent
  // fetch from the real VM, not just trusting the UI's optimistic
  // state.
  await page.goto('/vpn/ipsec-crypto')
  const reloadedGroupCard = cardWithText(page, GROUP_NAME)
  await expect(reloadedGroupCard).toBeVisible()
  await reloadedGroupCard.getByRole('button', { name: 'Proposals' }).click()
  await expect(reloadedGroupCard.getByText('1: aes256 / sha256')).toBeVisible()
})
