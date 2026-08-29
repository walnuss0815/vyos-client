import { expect, test } from '@playwright/test'
import { commitPendingChanges, login } from './helpers'

/**
 * Cross-validates this session's data-driven `snmp-weak-community-{name}`
 * config-warnings rule (frontend/src/lib/configWarningRules.json) against
 * a real VyOS VM, not just the fixture-driven unit test in
 * frontend/src/lib/configWarnings.test.ts. Adding an SNMP v1/v2c community
 * literally named "public" is the deliberately weak scenario that rule is
 * designed to flag - the point here is proving VyOS's real `service snmp
 * community <name> authorization ro` schema actually accepts the exact
 * syntax this app generates (SnmpSettings.tsx's "+ Add community" form),
 * round-tripping through a genuine commit, not that "public" is a good
 * community name to use.
 *
 * NOTE: `CONFIG_WARNINGS_ENABLED` is not set anywhere in e2e/run.sh (it
 * only exports VYOS_API_URL/VYOS_API_KEY/.../SESSION_SECRET/LISTEN_ADDR
 * before starting the vyos-client binary), and the banner
 * (ConfigWarningsBanner.tsx) short-circuits to `null` whenever
 * useSystemInfo()'s `configWarningsEnabled` flag is off - which is the
 * backend default (backend/internal/config/config.go). So this test
 * cannot assert the warnings banner itself appears; it only proves the
 * community round-trips through a real commit with VyOS's real schema.
 * Follow-up: if this suite ever wants to assert the banner text too, set
 * `CONFIG_WARNINGS_ENABLED=true` in the environment run.sh starts
 * vyos-client with, and add a `getByText(/well-known default string/i)`
 * assertion here.
 */
test('adds a "public" SNMP community and it round-trips through a real VyOS commit', async ({ page }) => {
  await login(page)

  // Bootstrap.exp never touches `service snmp`, so this starts from a
  // clean slate on every run - the enable-prompt path (SnmpSettings.tsx)
  // renders instead of the settings form until `service snmp` exists.
  await page.goto('/service/snmp')
  await expect(page.getByText(/snmp is not configured/i)).toBeVisible()
  await page.getByRole('button', { name: 'Enable SNMP' }).click()
  await commitPendingChanges(page)

  // Reload so SnmpPage refetches config fresh and `config.enabled` is
  // now true - only then does SnmpSettingsForm (with the communities
  // section) render at all.
  await page.goto('/service/snmp')
  await page.getByRole('button', { name: '+ Add community' }).click()

  // The name input's placeholder is literally "public" (see
  // SnmpSettings.tsx's CommunitiesSection) - fittingly, since that's
  // exactly the well-known-weak value this test deliberately uses.
  // Leaving the authorization <select> untouched keeps its default
  // value (''), which SnmpSettings.tsx renders as "Default (ro)" -
  // i.e. read-only, the form's simplest/default option.
  await page.getByPlaceholder('public').fill('public')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await commitPendingChanges(page)

  // Reload again (not just trusting the UI's optimistic pending-change
  // state) so this is a second, independent fetch confirming VyOS
  // itself stored `service snmp community public authorization ro`.
  await page.goto('/service/snmp')
  // Not `exact: true` - SnmpSettings.tsx renders the community name
  // and its authorization mode inside the SAME <span>
  // (`{community.name}<span>{authorization}</span>`), so no single
  // element's normalized text is ever exactly "public" alone - it's
  // always concatenated with the authorization mode too (e.g.
  // "publicro").
  await expect(page.getByText('public')).toBeVisible()

  // Cleanup: rather than removing just the "public" community leaf
  // (which would leave a bare, still-enabled `service snmp {}` behind),
  // use "Disable SNMP entirely" (disableSNMPOp -> a single `delete
  // service snmp`) so the VM genuinely has no SNMP config left at all
  // afterward, matching its pre-test state and keeping this cleanup to
  // one op instead of two.
  await page.getByRole('button', { name: /disable snmp entirely/i }).click()
  await commitPendingChanges(page)

  await page.goto('/service/snmp')
  await expect(page.getByText(/snmp is not configured/i)).toBeVisible()
})
