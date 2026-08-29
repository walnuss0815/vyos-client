import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { renderWithProviders } from '../test/testUtils'
import ConfigWarningsBanner from './ConfigWarningsBanner'

const CLEAN = {
  firewall: { ipv4: { input: { filter: { 'default-action': 'drop' } } } },
  service: {},
  system: {},
}

const WITH_WARNINGS = {
  firewall: { ipv4: { input: { filter: {} } } },
  service: { ssh: {}, https: {}, snmp: { community: { public: {} } } },
  system: { login: { user: { alice: {} } } },
}

beforeEach(() => {
  // The banner is disabled (CONFIG_WARNINGS_ENABLED=false) unless a
  // test explicitly opts in via /api/system/info - every test below
  // that exercises the banner's actual content does so; the "disabled
  // by default" gating itself is tested separately below with no
  // override, using the app-wide default mock.
  server.use(
    http.get('/api/system/info', () =>
      HttpResponse.json({ hostname: 'test-router', version: '1.5', configWarningsEnabled: true }),
    ),
  )
})

/** Returns a getter for how many of the three config-tree requests
 * (firewall/service/system) have resolved so far - used to wait for
 * all three underlying queries to settle in the "no warnings" test,
 * which has no positive UI marker of its own to wait on (the banner
 * renders nothing both while loading and once genuinely clean). */
function mockConfigTree(data: { firewall: unknown; service: unknown; system: unknown }): () => number {
  let resolvedCount = 0
  server.use(
    http.get('/api/config/tree', ({ request }) => {
      const path = new URL(request.url).searchParams.get('path')
      resolvedCount++
      if (path === 'firewall') return HttpResponse.json({ data: data.firewall })
      if (path === 'service') return HttpResponse.json({ data: data.service })
      if (path === 'system') return HttpResponse.json({ data: data.system })
      return HttpResponse.json({ data: {} })
    }),
  )
  return () => resolvedCount
}

describe('ConfigWarningsBanner', () => {
  it('renders nothing when there are no warnings', async () => {
    const resolvedCount = mockConfigTree(CLEAN)
    renderWithProviders(<ConfigWarningsBanner />)

    await waitFor(() => expect(resolvedCount()).toBeGreaterThanOrEqual(3))
    expect(screen.queryByText(/configuration warning/i)).not.toBeInTheDocument()
  })

  it('shows a collapsed summary with the warning count', async () => {
    mockConfigTree(WITH_WARNINGS)
    renderWithProviders(<ConfigWarningsBanner />)
    expect(await screen.findByText(/configuration warnings/i)).toBeInTheDocument()
    expect(screen.queryByText(/well-known default string/i)).not.toBeInTheDocument()
  })

  it('expands to show every individual warning message', async () => {
    const user = userEvent.setup()
    mockConfigTree(WITH_WARNINGS)
    renderWithProviders(<ConfigWarningsBanner />)

    await user.click(await screen.findByRole('button', { name: /configuration warnings/i }))

    expect(screen.getByText(/firewall ipv4 input chain/i)).toBeInTheDocument()
    expect(screen.getByText(/ssh password authentication/i)).toBeInTheDocument()
    expect(screen.getByText(/https api has no client address restriction/i)).toBeInTheDocument()
    expect(screen.getByText(/well-known default string/i)).toBeInTheDocument()
    expect(screen.getByText(/user "alice" has no password/i)).toBeInTheDocument()
  })

  it('collapses again on a second click', async () => {
    const user = userEvent.setup()
    mockConfigTree(WITH_WARNINGS)
    renderWithProviders(<ConfigWarningsBanner />)

    const toggle = await screen.findByRole('button', { name: /configuration warnings/i })
    await user.click(toggle)
    expect(screen.getByText(/well-known default string/i)).toBeInTheDocument()

    await user.click(toggle)
    expect(screen.queryByText(/well-known default string/i)).not.toBeInTheDocument()
  })
})

describe('ConfigWarningsBanner - disabled by default', () => {
  it('renders nothing, and never fetches config-tree data, when configWarningsEnabled is false', async () => {
    let systemInfoCallCount = 0
    let configTreeCallCount = 0
    server.use(
      http.get('/api/system/info', () => {
        systemInfoCallCount++
        return HttpResponse.json({ hostname: 'test-router', version: '1.5', configWarningsEnabled: false })
      }),
      http.get('/api/config/tree', () => {
        configTreeCallCount++
        return HttpResponse.json({ data: WITH_WARNINGS.firewall })
      }),
    )
    const { container } = renderWithProviders(<ConfigWarningsBanner />)

    await waitFor(() => expect(systemInfoCallCount).toBeGreaterThanOrEqual(1))
    expect(container).toBeEmptyDOMElement()
    expect(configTreeCallCount).toBe(0)
  })

  it('renders nothing while the feature-flag fetch itself is still loading', () => {
    server.use(http.get('/api/system/info', () => new Promise(() => {})))
    const { container } = renderWithProviders(<ConfigWarningsBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})
