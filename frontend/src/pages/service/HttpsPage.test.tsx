import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import HttpsPage from './HttpsPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('HttpsPage', () => {
  it('shows an enable prompt when service https is absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<HttpsPage />)

    expect(await screen.findByText(/not configured under this path/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'https'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<HttpsPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders configured API keys without leaking the key value', async () => {
    const https = { https: { api: { keys: { id: { 'my-key': { key: 'super-secret' } } } } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: https })))
    renderWithProviders(<HttpsPage />)

    expect(await screen.findByText('my-key')).toBeInTheDocument()
    expect(screen.getByText('key set')).toBeInTheDocument()
    expect(screen.queryByText('super-secret')).not.toBeInTheDocument()
  })

  it('adds a new API key', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { https: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<HttpsPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('button', { name: /\+ add key/i }))
    await user.type(screen.getByPlaceholderText('key id/name'), 'vyos-client')
    await user.type(screen.getByPlaceholderText('plaintext key value'), 'my-plaintext-key')
    await user.click(screen.getByRole('button', { name: /^add key$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'https', 'api', 'keys', 'id', 'vyos-client', 'key'],
      value: 'my-plaintext-key',
    })
  })

  it('saves settings changes', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { https: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<HttpsPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.type(screen.getByPlaceholderText('443'), '8443')
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'https', 'port'],
      value: '8443',
    })
  })

  it('disables https entirely', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { https: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<HttpsPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('button', { name: /disable https api entirely/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['service', 'https'] })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the settings form immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<HttpsPage />)

    await user.click(await screen.findByRole('button', { name: /enable/i }))

    expect(await screen.findByRole('button', { name: /save settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable https api entirely/i })).toBeInTheDocument()
  })

  // Regression test: see store/pendingChanges.ts's latestPendingOp.
  it('can be re-enabled after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<HttpsPage />)

    await user.click(await screen.findByRole('button', { name: /enable/i }))
    await user.click(await screen.findByRole('button', { name: /disable https api entirely/i }))
    await screen.findByRole('button', { name: /enable/i })
    await user.click(screen.getByRole('button', { name: /enable/i }))

    expect(await screen.findByRole('button', { name: /save settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable https api entirely/i })).toBeInTheDocument()
  })
})
