import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import EventHandlerPage from './EventHandlerPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('EventHandlerPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<EventHandlerPage />)

    expect(await screen.findByText(/event handler is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable event handler/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'event-handler'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<EventHandlerPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders an event and adds an environment variable', async () => {
    const handler = { 'event-handler': { event: { 'link-down': { script: { path: '/config/scripts/x.sh' } } } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: handler })))
    const user = userEvent.setup()
    renderWithProviders(<EventHandlerPage />)

    expect(await screen.findByText('link-down')).toBeInTheDocument()
    const card = screen.getByText('link-down').closest('div.rounded-xl')
    if (!card) throw new Error('event card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /environment/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText('LEVEL'), 'LEVEL')
    await user.type(within(card as HTMLElement).getByPlaceholderText('critical'), 'critical')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'event-handler', 'event', 'link-down', 'script', 'environment', 'LEVEL', 'value'],
      value: 'critical',
    })
  })

  it('creates a new event', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { 'event-handler': {} } })))
    const user = userEvent.setup()
    renderWithProviders(<EventHandlerPage />)
    await screen.findByRole('button', { name: /\+ new event/i })

    await user.click(screen.getByRole('button', { name: /\+ new event/i }))
    await user.type(screen.getByLabelText(/^name/i), 'link-up')
    await user.click(screen.getByRole('button', { name: /queue creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'event-handler', 'event', 'link-up'],
    })
  })
})
