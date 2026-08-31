import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import NdpProxyPage from './NdpProxyPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('NdpProxyPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<NdpProxyPage />)

    expect(await screen.findByText(/ndp proxy is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable ndp proxy/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'ndp-proxy'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<NdpProxyPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders an interface and adds a proxied prefix', async () => {
    const ndp = { 'ndp-proxy': { interface: { eth0: {} } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: ndp })))
    const user = userEvent.setup()
    renderWithProviders(<NdpProxyPage />)

    expect(await screen.findByText('eth0')).toBeInTheDocument()
    const card = screen.getByText('eth0').closest('div.rounded-xl')
    if (!card) throw new Error('interface card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add prefix/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText('2001:db8::/64'), '2001:db8::/64')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add prefix$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'ndp-proxy', 'interface', 'eth0', 'prefix', '2001:db8::/64'],
    })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the full list UI immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<NdpProxyPage />)

    await user.click(await screen.findByRole('button', { name: /enable ndp proxy/i }))

    expect(await screen.findByRole('button', { name: /disable ndp proxy entirely/i })).toBeInTheDocument()
  })

  it('reverts to the enable prompt immediately after clicking Disable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { 'ndp-proxy': {} } })))
    const user = userEvent.setup()
    renderWithProviders(<NdpProxyPage />)
    await screen.findByRole('button', { name: /disable ndp proxy entirely/i })

    await user.click(screen.getByRole('button', { name: /disable ndp proxy entirely/i }))

    expect(await screen.findByText(/ndp proxy is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enable ndp proxy/i })).toBeInTheDocument()
  })
})
