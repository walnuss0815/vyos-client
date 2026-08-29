import { expect, test } from '@playwright/test'
import { commitPendingChanges, login } from './helpers'

/**
 * A real round-trip through the commit pipeline for source NAT
 * (masquerade): queues a new `nat source rule <N>` via the tabbed
 * NATRuleForm (basic/match/translation - see NATRuleForm.tsx), commits
 * it (safe-apply off, immediate), then reloads to confirm VyOS's real
 * config parser (`GET /api/config/tree` → natParse.ts's `parseRule`)
 * accepts and reflects back the exact syntax this app's form
 * generates: `outbound-interface name eth0`, a `source address`
 * match, and `translation address masquerade` - source NAT's
 * dedicated "dynamically use the outbound interface's current
 * address" keyword, nested under `translation` exactly as
 * natRuleForm.ts's SCALAR_FIELDS/natRuleInterfacePath map them. This
 * is the first end-to-end proof that VyOS's actual NAT rule schema
 * matches this app's hand-modeled one, not just the fake REST server
 * in backend/internal/testutil.
 *
 * `eth0` is used as the outbound interface (not the frontend test's
 * `eth1`) since it's the only real interface the bootstrap VM
 * configures. `198.51.100.0/24` (RFC 5737 TEST-NET-2 - reserved for
 * documentation/testing, never a real allocation) is used as the
 * source match address instead of the frontend test's `10.0.0.0/24`,
 * so this doesn't ambiguously overlap any real private range on the
 * VM.
 */
test('creates a masquerade source NAT rule and it round-trips through a real VyOS commit', async ({
  page,
}) => {
  await login(page)
  await page.goto('/nat/source')

  await page.getByRole('button', { name: /\+ add rule/i }).click()

  // Rule number is auto-suggested by NATRuleForm.tsx's
  // suggestNextNumber (the bootstrap VM has no pre-existing NAT
  // config, so this'll be '10', but read it back instead of
  // hardcoding it - this test shouldn't silently start asserting on
  // the wrong row if some other rule already exists).
  const ruleNumber = await page.getByLabel('Rule number').inputValue()

  await page.getByLabel(/outbound interface/i).fill('eth0')

  await page.getByRole('button', { name: 'match', exact: true }).click()

  // NATRuleForm.tsx's match tab renders two side-by-side MatchFields
  // panels (Source/Destination), each with its own "Address"-labeled
  // input - getByLabel(/^address$/i) alone is ambiguous across both
  // (a Playwright strict-mode violation). The frontend's own Vitest
  // test resolves this with RTL's `within(screen.getByText('Source',
  // { selector: 'h4' }).closest('div'))`; Playwright has no `within`,
  // so scope with a CSS selector instead: `div:has(> h4:text-is(...))`
  // matches only the div whose *direct* child is the "Source" <h4> -
  // i.e. MatchFields' own wrapping <div> - not the outer two-column
  // grid container, which also "has" both Source and Destination
  // <h4>s as descendants and would otherwise match too.
  const sourceFields = page.locator('div:has(> h4:text-is("Source"))')
  await sourceFields.getByLabel(/^address$/i).fill('198.51.100.0/24')

  await page.getByRole('button', { name: 'translation', exact: true }).click()
  await page.getByLabel(/translation address/i).fill('masquerade')

  await page.getByRole('button', { name: /queue new rule/i }).click()

  await commitPendingChanges(page)

  // Reload from scratch (not just trusting the UI's optimistic state)
  // so NATRuleList re-fetches GET /api/config/tree fresh and re-runs
  // natParse.ts's parseRule against the real VyOS VM's now-committed
  // config, and scope to this rule's own table row so the interface,
  // source address, and translation assertions can't accidentally
  // match some other row.
  await page.goto('/nat/source')
  const row = page.locator('tr').filter({ has: page.getByText(ruleNumber, { exact: true }) })
  await expect(row.getByText('eth0', { exact: true })).toBeVisible()
  await expect(row.getByText('198.51.100.0/24', { exact: true })).toBeVisible()
  await expect(row.getByText('masquerade', { exact: true })).toBeVisible()
})
