import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('masks the real VyOS API key in the Config Tree page', async ({ page }) => {
  const realApiKey = process.env.E2E_VYOS_API_KEY
  if (!realApiKey) throw new Error('E2E_VYOS_API_KEY not set - run.sh should always set this')

  await login(page)
  await page.goto('/config-tree')

  // The "Set commands" view is a single flat text dump of the entire
  // (masked) running config - a real `service https api keys id
  // e2etest key '<value>'` entry exists (added during e2e bootstrap,
  // see bootstrap.exp), sourced from the actual VyOS VM's config, not
  // a fixture.
  await page.getByRole('button', { name: 'Set commands' }).click()

  const commands = page.locator('pre')
  await expect(commands).toContainText('service https api keys id e2etest key')
  await expect(commands).toContainText('••••••••')
  await expect(commands).not.toContainText(realApiKey)
})
