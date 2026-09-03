// Takes a screenshot of the Dashboard page for docs/images/dashboard.png
// (embedded in the repo root README.md), logged in against the
// docker-compose stack's mock-vyos backend - NOT part of the real-VyOS
// end-to-end suite in ../specs/ (deliberately a standalone script, not
// a playwright.config.ts-driven test: that config's baseURL/credentials
// are for the real-VM suite in ../run.sh, not this stack). Reuses the
// same @playwright/test dependency already installed here (pinned to
// match nixpkgs' playwright-driver Chromium - see ../../../flake.nix)
// rather than adding a second one.
//
// Usage:
//   cp .env.example .env && docker compose up --build -d
//   npm run screenshot   (from e2e/tests/)
//   docker compose down
//
// Override SCREENSHOT_BASE_URL/SCREENSHOT_USER/SCREENSHOT_PASSWORD if
// your stack isn't the default docker-compose one.

import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const baseURL = process.env.SCREENSHOT_BASE_URL ?? 'https://localhost:8443'
const username = process.env.SCREENSHOT_USER ?? 'admin'
const password = process.env.SCREENSHOT_PASSWORD ?? 'admin'

const outFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/images/dashboard.png',
)

// Mirrors DEFAULT_MAX_SAMPLES (150) * LIVE_CHART_REFETCH_MS (2000) from
// frontend/src/hooks/useSampleHistory.ts and frontend/src/pages/
// DashboardPage.tsx: the fixed 5-minute span the CPU/Memory/Throughput
// sparkline charts' x-axis always represents (newest sample pinned to
// the right edge, regardless of how many samples actually exist yet -
// see UsageChart.tsx). Used below to fast-forward a fake clock through
// a full window's worth of "Live charts (2s)" polls, so the charts are
// fully populated rather than showing a few samples squeezed into a
// sliver at the right edge.
const CHART_WINDOW_MS = 150 * 2000

const browser = await chromium.launch()
try {
  const context = await browser.newContext({
    baseURL,
    // Tall enough that this app's own scrollable region (an inner
    // <main overflow-y-auto>, not the document body - `fullPage`
    // screenshots can't help here, since the top-level page is
    // always exactly one viewport tall by design) shows the whole
    // Dashboard - header, stat cards, resource/throughput charts,
    // and both routing tables - without needing to actually scroll,
    // given how little data the mock seeds.
    viewport: { width: 1600, height: 1700 },
    // The backend generates a self-signed cert when no TLS_CERT_FILE
    // is configured (true for the default docker-compose stack) -
    // same reasoning as ../playwright.config.ts's own setting.
    ignoreHTTPSErrors: true,
  })

  // Forces dark mode deterministically regardless of the headless
  // browser's default prefers-color-scheme, instead of relying on the
  // app's default 'auto' mode - matches zustand persist's exact wire
  // shape (see frontend/src/store/theme.ts's THEME_STORAGE_KEY and
  // frontend/public/theme-init.js, which both read this same key) so
  // the dark theme is already active before first paint, no
  // flash-of-light-theme in the screenshot.
  await context.addInitScript(() => {
    localStorage.setItem('vyos-client-theme', JSON.stringify({ state: { mode: 'dark' }, version: 0 }))
  })

  const page = await context.newPage()

  // Installed before navigating so login proceeds under a real-time-
  // flowing fake clock (per Playwright's own recommendation) - only
  // once the Dashboard is up do we deliberately run the clock forward
  // through a full chart window below, well beyond the ~5 real minutes
  // it would otherwise take to naturally accumulate that many polls.
  await page.clock.install()

  await page.goto('/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('/')

  // Confirms the Dashboard's real data has actually loaded (not just
  // the route) before screenshotting - the same web-first, auto-
  // retrying assertion login.spec.ts uses in the real e2e suite
  // (expect() polls until it passes or times out, regardless of
  // whether it's called inside a `test()` block).
  const versionCard = page.getByRole('main').getByText('VyOS version').locator('..')
  await expect(versionCard).not.toContainText('…')

  // Runs the fake clock forward through a full chart window so the
  // "Live charts (2s)" polling (a real setInterval/setTimeout, now
  // intercepted by the fake clock) fires ~150 times. Unlike
  // `clock.fastForward` (which only fires each due timer at most
  // once, jumping straight to the end), `runFor` fires every due
  // callback along the way and waits for the real fetch each one
  // triggers to settle before continuing - so this produces genuine
  // polled samples, just via simulated rather than real elapsed time.
  await page.clock.runFor(CHART_WINDOW_MS)

  await mkdir(path.dirname(outFile), { recursive: true })
  await page.screenshot({ path: outFile })
  console.log(`Saved ${outFile}`)
} finally {
  await browser.close()
}
