import { expect, test } from '@playwright/test'
import { commitPendingChanges, login } from './helpers'

// VyOS custom firewall chain names follow the same identifier rules as
// zones/groups (frontend/src/lib/vyosIdentifier.ts) - alphanumeric plus
// hyphen/underscore, not starting with hyphen/underscore - and are
// conventionally uppercase (see RulesetsPage.tsx's own
// `placeholder="WAN-LAN-v4"`). "E2ETEST" is deliberately not one of
// the three base chains (input/forward/output) - see the test's own
// doc comment for why.
const RULESET_NAME = 'E2ETEST'

/**
 * Creates a brand new custom firewall chain (ruleset) plus a single
 * rule inside it, committing each step against the real VyOS VM, then
 * reloads and confirms both landed - a genuine round-trip through
 * VyOS's *firewall* config tree specifically, which is one of VyOS's
 * stricter/pickier schemas (nested `filter`/`name` nodes, numbered
 * rule containers) and, unlike `system host-name` (commit.spec.ts),
 * has never been touched by any other spec in this suite - the
 * bootstrap VM starts with zero firewall config.
 *
 * Safety: the new chain is a *custom* chain (RulesetsPage.tsx's
 * CreateRulesetForm always creates `firewall <family> name <name>`,
 * never one of the three base chains), and this test never references
 * it from anywhere else - it's not attached to an interface, not a
 * zone's `from ... firewall name <chain>` target (ZoneMatrix.tsx),
 * and not a `jump` target from any base chain's rules. VyOS only ever
 * evaluates a custom chain's rules when something jumps to it, so an
 * unattached custom chain like this one is inert by construction -
 * zero effect on real traffic, meaning it can't break the eth0/REST
 * API reachability that every other e2e test sharing this VM depends
 * on, regardless of run order.
 */
test('creates a custom firewall ruleset and a rule inside it, and both round-trip through a real VyOS commit', async ({
  page,
}) => {
  await login(page)

  // --- Step 1: create the ruleset (RulesetsPage.tsx) ---
  await page.goto('/firewall/rulesets')
  await page.getByRole('button', { name: /new custom ruleset/i }).click()
  await page.getByPlaceholder('WAN-LAN-v4').fill(RULESET_NAME)
  // Family selector already defaults to ipv4 (CreateRulesetForm's
  // `useState<'ipv4' | 'ipv6'>('ipv4')`) - nothing to change here.
  await page.getByRole('button', { name: /queue ruleset creation/i }).click()

  await commitPendingChanges(page)

  // Reload the list fresh (not just this session's optimistic
  // pending-changes state) to confirm VyOS actually persisted the new
  // chain, and grab the real link it renders for step 2.
  await page.goto('/firewall/rulesets')
  const rulesetLink = page.getByRole('link', { name: RULESET_NAME })
  await expect(rulesetLink).toHaveAttribute('href', `/firewall/rulesets/ipv4/custom/${RULESET_NAME}`)

  // --- Step 2: add one rule inside it (RulesetDetailPage.tsx / RuleForm.tsx) ---
  await rulesetLink.click()
  await expect(page.getByRole('heading', { name: RULESET_NAME })).toBeVisible()

  await page.getByRole('button', { name: /add rule/i }).click()
  // No rules exist yet in this brand new chain, so RuleForm's
  // suggestNextNumber() defaults the new rule to '10' - left as-is
  // rather than retyped, exercising that default path for real.
  await expect(page.getByLabel('Rule number')).toHaveValue('10')
  await page.getByLabel(/^action/i).selectOption('accept')
  // A description is a harmless match-adjacent field (not an actual
  // traffic-matching criterion) - just enough to prove real rule data
  // round-trips, without adding any address/port/interface match that
  // could conceivably matter if this chain were ever mistakenly wired
  // up later.
  await page.getByLabel('Description', { exact: true }).fill('e2e test rule - harmless, unattached chain')
  await page.getByRole('button', { name: /queue new rule/i }).click()

  await commitPendingChanges(page)

  // Reload once more and confirm both the ruleset and the rule inside
  // it are genuinely present in VyOS's running config - a second,
  // independent fetch from the real VM, not just trusting the UI's
  // optimistic state.
  await page.goto(`/firewall/rulesets/ipv4/custom/${RULESET_NAME}`)
  await expect(page.getByRole('heading', { name: RULESET_NAME })).toBeVisible()
  const table = page.getByRole('table')
  await expect(table.getByText('10')).toBeVisible()
  await expect(table.getByText('accept')).toBeVisible()
  await expect(table.getByText('e2e test rule - harmless, unattached chain')).toBeVisible()
})
