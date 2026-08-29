import { defineConfig, devices } from '@playwright/test'

/**
 * Config for the real-VyOS end-to-end suite (see ../run.sh, which sets
 * E2E_BASE_URL/E2E_UI_ADMIN_USER/E2E_UI_ADMIN_PASSWORD/E2E_VYOS_API_KEY
 * before invoking `playwright test`). Deliberately separate from the
 * frontend's own Vitest+MSW suite - this drives a real browser against
 * a real vyos-client instance backed by a real VyOS VM, no mocking.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // shares one live VyOS instance - avoid racing commits
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://localhost:18080',
    // The backend generates a self-signed cert when no TLS_CERT_FILE
    // is configured (true for this test run - see run.sh).
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
