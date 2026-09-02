import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import UpgradesPage from './UpgradesPage'

const DISABLED_STATUS = { enabled: false }

const UP_TO_DATE_STATUS = {
  enabled: true,
  containerName: 'vyos-client',
  imageRepo: 'ghcr.io/walnuss0815/vyos-client',
  currentVersion: '1.2.0',
  latestVersion: '1.2.0',
  currentVersionRecognized: true,
  updateAvailable: false,
  releases: [],
}

const UPDATE_AVAILABLE_STATUS = {
  enabled: true,
  containerName: 'vyos-client',
  imageRepo: 'ghcr.io/walnuss0815/vyos-client',
  currentVersion: '1.2.0',
  latestVersion: '1.3.0',
  currentVersionRecognized: true,
  updateAvailable: true,
  releases: [
    {
      version: '1.3.0',
      name: '1.3.0',
      body: '## Features\n\n- Added a thing\n\nSee [the diff](https://example.com) for more.',
      publishedAt: '2026-02-01T00:00:00Z',
      htmlUrl: 'https://github.com/walnuss0815/vyos-client/releases/tag/v1.3.0',
      imageExists: true,
    },
  ],
}

const DEV_BUILD_STATUS = {
  enabled: true,
  containerName: 'vyos-client',
  imageRepo: 'ghcr.io/walnuss0815/vyos-client',
  currentVersion: 'dev',
  latestVersion: '1.3.0',
  currentVersionRecognized: false,
  updateAvailable: false,
  releases: [],
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UpgradesPage', () => {
  it('shows a disabled explanation when self-upgrade is not enabled', async () => {
    server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(DISABLED_STATUS)))
    renderWithProviders(<UpgradesPage />)
    expect(await screen.findByText(/self-upgrade is disabled/i)).toBeInTheDocument()
    expect(screen.getByText('SELF_UPGRADE_ENABLED=true')).toBeInTheDocument()
  })

  it('shows an error message when the check fails', async () => {
    server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<UpgradesPage />)
    expect(await screen.findByText(/failed to check for updates/i)).toBeInTheDocument()
  })

  it('shows the current version and an up-to-date message when there is no newer release', async () => {
    server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(UP_TO_DATE_STATUS)))
    renderWithProviders(<UpgradesPage />)
    expect(await screen.findByText(/running the latest published release/i)).toBeInTheDocument()
    expect(screen.getAllByText('1.2.0')).toHaveLength(2)
  })

  it('shows a message when the current build\'s version cannot be checked', async () => {
    server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(DEV_BUILD_STATUS)))
    renderWithProviders(<UpgradesPage />)
    await screen.findByText(/latest published release/i)
    expect(screen.getByText(/isn't a recognized release version/i)).toBeInTheDocument()
    expect(screen.queryByText(/running the latest published release/i)).not.toBeInTheDocument()
  })

  it('lists a newer release with its rendered notes and an Upgrade button', async () => {
    server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(UPDATE_AVAILABLE_STATUS)))
    renderWithProviders(<UpgradesPage />)

    expect(await screen.findByText(/1 update available/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upgrade to 1.3.0' })).toBeInTheDocument()
    // The Markdown body should be rendered, not shown as raw source.
    expect(screen.getByRole('heading', { name: 'Features' })).toBeInTheDocument()
    expect(screen.getByText('Added a thing')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'the diff' })).toHaveAttribute('href', 'https://example.com')
  })

  it('pulls the image and queues the config change when Upgrade is clicked', async () => {
    server.use(
      http.get('/api/system/self-upgrade', () => HttpResponse.json(UPDATE_AVAILABLE_STATUS)),
      http.post('/api/container/images', async ({ request }) => {
        const body = (await request.json()) as { name: string }
        expect(body.name).toBe('ghcr.io/walnuss0815/vyos-client:1.3.0')
        return HttpResponse.json({ message: 'pulled' })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<UpgradesPage />)

    await user.click(await screen.findByRole('button', { name: 'Upgrade to 1.3.0' }))
    await screen.findByText(/pulled and queued image/i)

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['container', 'name', 'vyos-client', 'image'],
      value: 'ghcr.io/walnuss0815/vyos-client:1.3.0',
    })
  })

  it('does not warn about an unrecognized "node" DOM prop when rendering release notes', async () => {
    // Regression test: react-markdown always passes a `node` prop to
    // custom element components; spreading it straight onto the DOM
    // tag (as markdownComponents used to) makes React log a
    // "does not recognize the `node` prop" warning for every element
    // in every rendered release's notes.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(UPDATE_AVAILABLE_STATUS)))
    renderWithProviders(<UpgradesPage />)

    await screen.findByRole('heading', { name: 'Features' })

    const nodePropWarning = consoleError.mock.calls.find((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('node') && arg.includes('DOM element')),
    )
    expect(nodePropWarning).toBeUndefined()
  })

  it('disables Upgrade and shows a message when an upgrade is already queued', async () => {
    // Regression test: the pending-changes store is append-only, so
    // clicking "Upgrade" again (e.g. after navigating away and back)
    // while a previous upgrade's `set container name ... image ...`
    // op is still queued used to add a second, contradictory-looking
    // entry instead of being blocked.
    usePendingChangesStore.setState({
      changes: [
        {
          id: '1',
          op: { op: 'set', path: ['container', 'name', 'vyos-client', 'image'], value: 'ghcr.io/walnuss0815/vyos-client:1.3.0' },
          label: 'already queued',
        },
      ],
    })
    server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(UPDATE_AVAILABLE_STATUS)))
    const user = userEvent.setup()
    renderWithProviders(<UpgradesPage />)

    const upgradeButton = await screen.findByRole('button', { name: 'Upgrade to 1.3.0' })
    expect(upgradeButton).toBeDisabled()
    expect(screen.getByText(/an upgrade is already queued/i)).toBeInTheDocument()

    await user.click(upgradeButton)
    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
  })

  it('shows an error message when the pull fails, without queuing anything', async () => {
    server.use(
      http.get('/api/system/self-upgrade', () => HttpResponse.json(UPDATE_AVAILABLE_STATUS)),
      http.post('/api/container/images', () => HttpResponse.json({ error: 'no space left on device' }, { status: 502 })),
    )
    const user = userEvent.setup()
    renderWithProviders(<UpgradesPage />)

    await user.click(await screen.findByRole('button', { name: 'Upgrade to 1.3.0' }))
    expect(await screen.findByText(/no space left on device/i)).toBeInTheDocument()

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(0)
  })

  it('disables Upgrade and explains when the release image does not exist yet on ghcr.io', async () => {
    const NOT_YET_PUBLISHED_STATUS = {
      ...UPDATE_AVAILABLE_STATUS,
      releases: [{ ...UPDATE_AVAILABLE_STATUS.releases[0], imageExists: false }],
    }
    server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(NOT_YET_PUBLISHED_STATUS)))
    renderWithProviders(<UpgradesPage />)

    const upgradeButton = await screen.findByRole('button', { name: 'Upgrade to 1.3.0' })
    expect(upgradeButton).toBeDisabled()
    expect(screen.getByText(/isn't available on ghcr.io yet/i)).toBeInTheDocument()
  })

  // Regression guard for the explicit requirement that whatever's
  // already cached/known must show up on mount, with zero user
  // interaction - not just after clicking Refresh. This is already
  // implicitly exercised by the tests above (none of them click
  // anything before asserting on the shown status), but this test
  // makes that guarantee explicit and named.
  it('shows update availability from the initial load alone, with no interaction required', async () => {
    server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(UPDATE_AVAILABLE_STATUS)))
    renderWithProviders(<UpgradesPage />)

    expect(await screen.findByText(/1 update available/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upgrade to 1.3.0' })).toBeInTheDocument()
  })

  describe('Refresh', () => {
    it('sends force=true and replaces the shown data with the fresh result', async () => {
      server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(UP_TO_DATE_STATUS)))
      const user = userEvent.setup()
      renderWithProviders(<UpgradesPage />)
      await screen.findByText(/running the latest published release/i)

      let requestedForceParam: string | null = null
      server.use(
        http.get('/api/system/self-upgrade', ({ request }) => {
          requestedForceParam = new URL(request.url).searchParams.get('force')
          return HttpResponse.json(UPDATE_AVAILABLE_STATUS)
        }),
      )
      await user.click(screen.getByRole('button', { name: 'Refresh' }))

      expect(await screen.findByText(/1 update available/i)).toBeInTheDocument()
      expect(requestedForceParam).toBe('true')
    })

    it('shows "Refreshing…" and disables the button while the forced check is in flight', async () => {
      server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(UP_TO_DATE_STATUS)))
      const user = userEvent.setup()
      renderWithProviders(<UpgradesPage />)
      await screen.findByText(/running the latest published release/i)

      server.use(http.get('/api/system/self-upgrade', () => new Promise(() => {})))
      await user.click(screen.getByRole('button', { name: 'Refresh' }))

      const refreshingButton = await screen.findByRole('button', { name: 'Refreshing…' })
      expect(refreshingButton).toBeDisabled()
    })

    it('shows an error message when the forced check fails, without discarding the last known status', async () => {
      server.use(http.get('/api/system/self-upgrade', () => HttpResponse.json(UP_TO_DATE_STATUS)))
      const user = userEvent.setup()
      renderWithProviders(<UpgradesPage />)
      await screen.findByText(/running the latest published release/i)

      server.use(
        http.get('/api/system/self-upgrade', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })),
      )
      await user.click(screen.getByRole('button', { name: 'Refresh' }))

      expect(await screen.findByText(/unreachable/i)).toBeInTheDocument()
      // The last known (successful) status must still be shown - a
      // failed manual refresh shouldn't blank out the page.
      expect(screen.getByText(/running the latest published release/i)).toBeInTheDocument()
    })
  })
})
