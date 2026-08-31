import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import DnsForwardingPage from './DnsForwardingPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('DnsForwardingPage', () => {
  it('shows an enable prompt when service dns forwarding is absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<DnsForwardingPage />)

    expect(await screen.findByText(/dns forwarding is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable dns forwarding/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'dns', 'forwarding'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<DnsForwardingPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders forwarders and per-domain entries, and lets a domain name server be added', async () => {
    const dns = {
      dns: {
        forwarding: {
          'name-server': { '8.8.8.8': {} },
          domain: { 'example.com': {} },
        },
      },
    }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: dns })))
    const user = userEvent.setup()
    renderWithProviders(<DnsForwardingPage />)

    expect(await screen.findByText('8.8.8.8')).toBeInTheDocument()
    expect(screen.getByText('example.com')).toBeInTheDocument()

    const card = screen.getByText('example.com').closest('div.rounded-xl')
    if (!card) throw new Error('domain card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /name servers/i }))
    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText('8.8.8.8'), '192.0.2.53')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'dns', 'forwarding', 'domain', 'example.com', 'name-server', '192.0.2.53'],
    })
  })

  it('saves settings changes', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { dns: { forwarding: {} } } })))
    const user = userEvent.setup()
    renderWithProviders(<DnsForwardingPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.type(screen.getByPlaceholderText('53'), '5353')
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'dns', 'forwarding', 'port'],
      value: '5353',
    })
  })

  it('creates a new per-domain forwarder', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { dns: { forwarding: {} } } })))
    const user = userEvent.setup()
    renderWithProviders(<DnsForwardingPage />)
    await screen.findByRole('button', { name: /\+ new domain/i })

    await user.click(screen.getByRole('button', { name: /\+ new domain/i }))
    await user.type(screen.getByPlaceholderText('internal.example.com'), 'lan.example.com')
    await user.click(screen.getByRole('button', { name: /^add domain$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'dns', 'forwarding', 'domain', 'lan.example.com'],
    })
  })

  it('disables DNS forwarding entirely', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { dns: { forwarding: {} } } })))
    const user = userEvent.setup()
    renderWithProviders(<DnsForwardingPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('button', { name: /disable dns forwarding entirely/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['service', 'dns', 'forwarding'] })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the settings form immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<DnsForwardingPage />)

    await user.click(await screen.findByRole('button', { name: /enable dns forwarding/i }))

    expect(await screen.findByRole('button', { name: /save settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable dns forwarding entirely/i })).toBeInTheDocument()
  })
})
