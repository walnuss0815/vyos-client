import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ConsoleServerPage from './ConsoleServerPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('ConsoleServerPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<ConsoleServerPage />)

    expect(await screen.findByText(/console server is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable console server/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'console-server'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<ConsoleServerPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders a device and creates a new one', async () => {
    const consoleServer = { 'console-server': { device: { ttyS0: { speed: '115200' } } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: consoleServer })))
    const user = userEvent.setup()
    renderWithProviders(<ConsoleServerPage />)

    expect(await screen.findByText('ttyS0')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /\+ new device/i }))
    await user.type(screen.getByLabelText(/^device/i), 'ttyS1')
    await user.click(screen.getByRole('button', { name: /queue creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'console-server', 'device', 'ttyS1'],
    })
  })
})
