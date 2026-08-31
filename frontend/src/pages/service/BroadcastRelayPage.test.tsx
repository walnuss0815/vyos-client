import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import BroadcastRelayPage from './BroadcastRelayPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('BroadcastRelayPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<BroadcastRelayPage />)

    expect(await screen.findByText(/broadcast relay is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable broadcast relay/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'broadcast-relay'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<BroadcastRelayPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders an instance and adds an interface to it', async () => {
    const relay = { 'broadcast-relay': { id: { '5': { description: 'WoL' } } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: relay })))
    const user = userEvent.setup()
    renderWithProviders(<BroadcastRelayPage />)

    expect(await screen.findByText('id 5')).toBeInTheDocument()
    const card = screen.getByText('id 5').closest('div.rounded-xl')
    if (!card) throw new Error('instance card not found')
    await user.type(within(card as HTMLElement).getByPlaceholderText('eth0'), 'eth0')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'broadcast-relay', 'id', '5', 'interface'],
      value: 'eth0',
    })
  })

  it('creates a new instance', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { 'broadcast-relay': {} } })))
    const user = userEvent.setup()
    renderWithProviders(<BroadcastRelayPage />)
    await screen.findByRole('button', { name: /\+ new instance/i })

    await user.click(screen.getByRole('button', { name: /\+ new instance/i }))
    await user.type(screen.getByLabelText(/^id/i), '10')
    await user.click(screen.getByRole('button', { name: /queue creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'broadcast-relay', 'id', '10'],
    })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the full list UI immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<BroadcastRelayPage />)

    await user.click(await screen.findByRole('button', { name: /enable broadcast relay/i }))

    expect(await screen.findByRole('button', { name: /\+ new instance/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable entirely \(remove config\)/i })).toBeInTheDocument()
  })

  it('reverts to the enable prompt immediately after clicking Disable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { 'broadcast-relay': {} } })))
    const user = userEvent.setup()
    renderWithProviders(<BroadcastRelayPage />)
    await screen.findByRole('button', { name: /\+ new instance/i })

    await user.click(screen.getByRole('button', { name: /disable entirely \(remove config\)/i }))

    expect(await screen.findByText(/broadcast relay is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enable broadcast relay/i })).toBeInTheDocument()
  })
})
