import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../test/mocks/server'
import { renderWithProviders } from '../test/testUtils'
import LogsPage from './LogsPage'

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
  HTMLAnchorElement.prototype.click = vi.fn()
})

describe('LogsPage', () => {
  it('fetches the System source by default and shows the returned lines', async () => {
    server.use(
      http.get('/api/logs', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('source')).toBe('system')
        return HttpResponse.json({ lines: ['line one', 'line two'], truncated: false })
      }),
    )
    renderWithProviders(<LogsPage />)

    expect(await screen.findByText(/line one/)).toBeInTheDocument()
    expect(screen.getByText(/line two/)).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    server.use(http.get('/api/logs', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<LogsPage />)
    expect(await screen.findByText(/failed to load this log/i)).toBeInTheDocument()
  })

  it('shows a truncation notice when the response says the tail was cut off', async () => {
    server.use(http.get('/api/logs', () => HttpResponse.json({ lines: ['a'], truncated: true })))
    renderWithProviders(<LogsPage />)
    expect(await screen.findByText(/showing the last 500 lines/i)).toBeInTheDocument()
  })

  it('shows a placeholder when the log has no lines', async () => {
    server.use(http.get('/api/logs', () => HttpResponse.json({ lines: [], truncated: false })))
    renderWithProviders(<LogsPage />)
    expect(await screen.findByText('No log lines to show.')).toBeInTheDocument()
  })

  it('switches to the facility source and requests the selected facility', async () => {
    const user = userEvent.setup()
    let lastFacilityParam: string | null = null
    server.use(
      http.get('/api/logs', ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('source') === 'facility') {
          lastFacilityParam = url.searchParams.get('facility')
        }
        return HttpResponse.json({ lines: ['facility line'], truncated: false })
      }),
    )
    renderWithProviders(<LogsPage />)
    await screen.findByRole('combobox', { name: 'Source' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Source' }), 'By facility…')
    const facilitySelect = await screen.findByRole('combobox', { name: 'Facility' })
    await user.selectOptions(facilitySelect, 'local7')

    await waitFor(() => expect(lastFacilityParam).toBe('local7'))
  })

  it('switches to the priority source and requests the selected priority', async () => {
    const user = userEvent.setup()
    let lastPriorityParam: string | null = null
    server.use(
      http.get('/api/logs', ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('source') === 'priority') {
          lastPriorityParam = url.searchParams.get('priority')
        }
        return HttpResponse.json({ lines: ['priority line'], truncated: false })
      }),
    )
    renderWithProviders(<LogsPage />)
    await screen.findByRole('combobox', { name: 'Source' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Source' }), 'By priority…')
    const prioritySelect = await screen.findByRole('combobox', { name: 'Minimum priority' })
    await user.selectOptions(prioritySelect, 'debug')

    await waitFor(() => expect(lastPriorityParam).toBe('debug'))
  })

  it('shows "no containers configured" instead of fetching when source=container has none available', async () => {
    const user = userEvent.setup()
    let containerFetchCount = 0
    server.use(
      http.get('/api/logs', ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('source') === 'container') containerFetchCount++
        return HttpResponse.json({ lines: [], truncated: false })
      }),
    )
    renderWithProviders(<LogsPage />)
    await screen.findByRole('combobox', { name: 'Source' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Source' }), 'Container…')
    expect(await screen.findByText('No containers are configured yet.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Container' })).not.toBeInTheDocument()
    expect(containerFetchCount).toBe(0)
  })

  it('lists configured containers and requests logs for the selected one', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/config/tree', () =>
        HttpResponse.json({
          data: {
            name: {
              web: {},
              db: {},
            },
          },
        }),
      ),
      http.get('/api/logs', ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('source') === 'container') {
          return HttpResponse.json({ lines: [`log for ${url.searchParams.get('container')}`], truncated: false })
        }
        return HttpResponse.json({ lines: [], truncated: false })
      }),
    )
    renderWithProviders(<LogsPage />)
    await screen.findByRole('combobox', { name: 'Source' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Source' }), 'Container…')
    const containerSelect = await screen.findByRole('combobox', { name: 'Container' })
    expect(containerSelect).toHaveValue('db') // alphabetically sorted, "db" before "web"
    expect(await screen.findByText('log for db')).toBeInTheDocument()

    await user.selectOptions(containerSelect, 'web')
    expect(await screen.findByText('log for web')).toBeInTheDocument()
  })

  it('requests the selected line count', async () => {
    const user = userEvent.setup()
    let lastLinesParam: string | null = null
    server.use(
      http.get('/api/logs', ({ request }) => {
        lastLinesParam = new URL(request.url).searchParams.get('lines')
        return HttpResponse.json({ lines: ['a'], truncated: false })
      }),
    )
    renderWithProviders(<LogsPage />)
    await screen.findByText('a')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Lines' }), '2000')
    await waitFor(() => expect(lastLinesParam).toBe('2000'))
  })

  it('filters the shown lines with the search box, client-side', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/logs', () =>
        HttpResponse.json({ lines: ['apple pie', 'banana split', 'apple sauce'], truncated: false }),
      ),
    )
    renderWithProviders(<LogsPage />)
    await screen.findByText(/banana split/)

    await user.type(screen.getByPlaceholderText('filter shown lines'), 'apple')
    expect(screen.getByText(/apple pie/)).toBeInTheDocument()
    expect(screen.getByText(/apple sauce/)).toBeInTheDocument()
    expect(screen.queryByText(/banana split/)).not.toBeInTheDocument()
  })

  it('clears the displayed lines when Clear is clicked', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/logs', () => HttpResponse.json({ lines: ['hello'], truncated: false })))
    renderWithProviders(<LogsPage />)
    await screen.findByText('hello')

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByText('hello')).not.toBeInTheDocument()
    expect(screen.getByText('No log lines to show.')).toBeInTheDocument()
  })

  it('downloads the currently loaded lines as a text file', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/logs', () => HttpResponse.json({ lines: ['hello'], truncated: false })))
    renderWithProviders(<LogsPage />)
    await screen.findByText('hello')

    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  })

  it('disables the download button until there are lines to download', () => {
    renderWithProviders(<LogsPage />)
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled()
  })

  it('has an auto-poll toggle, off by default', () => {
    renderWithProviders(<LogsPage />)
    const toggle = screen.getByRole('checkbox', { name: /auto-poll/i })
    expect(toggle).not.toBeChecked()
  })

  // Regression test for a dead-on-first-load bug: the auto-scroll
  // effect that attaches the viewport's scroll listener used to depend
  // on a `useRef` object's own (always-stable) identity, so it only
  // ever ran once, while the conditionally-rendered <pre> hadn't
  // mounted yet and ref.current was still null - the listener then
  // never attached for the rest of the page's life, and every new poll
  // force-scrolled to the bottom regardless of where the user had
  // scrolled to (the opposite of this feature's whole point). jsdom
  // does no real layout, so scrollHeight/clientHeight are stubbed with
  // fixed values and scrollTop is backed by a plain writable property,
  // just enough for the hook's own distance-from-bottom arithmetic to
  // behave like a real scrollable element.
  it('keeps the viewport scrolled to where the user left it once the listener has had a chance to attach', async () => {
    let requestCount = 0
    server.use(
      http.get('/api/logs', () => {
        requestCount++
        const lines = requestCount === 1 ? ['line 1'] : ['line 1', 'line 2', 'line 3']
        return HttpResponse.json({ lines, truncated: false })
      }),
    )
    const { container } = renderWithProviders(<LogsPage />)
    await screen.findByText(/line 1/)

    const viewport = container.querySelector('pre')
    if (!viewport) throw new Error('expected the log viewport <pre> to be in the document')
    Object.defineProperty(viewport, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(viewport, 'clientHeight', { value: 100, configurable: true })
    let scrollTopValue = 0
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: (v: number) => {
        scrollTopValue = v
      },
    })

    // Scroll far away from the bottom and fire the event the listener
    // (if attached) reacts to.
    scrollTopValue = 0
    viewport.dispatchEvent(new Event('scroll'))

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(viewport.textContent).toContain('line 3'))

    // A live listener recorded "not at the bottom" above, so the new
    // content shouldn't have yanked scrollTop back down to
    // scrollHeight - if the listener never attached (the bug), this
    // would be 1000 instead.
    expect(viewport.scrollTop).toBe(0)
  })
})
