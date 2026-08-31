import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import TftpPage from './TftpPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('TftpPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<TftpPage />)

    expect(await screen.findByText(/tftp server is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable tftp server/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'tftp-server'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<TftpPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('saves settings and adds a listen-address', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { 'tftp-server': {} } })))
    const user = userEvent.setup()
    renderWithProviders(<TftpPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.type(screen.getByPlaceholderText('/srv/tftp'), '/srv/tftp')
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'tftp-server', 'directory'],
      value: '/srv/tftp',
    })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the settings form immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<TftpPage />)

    await user.click(await screen.findByRole('button', { name: /enable tftp server/i }))

    expect(await screen.findByRole('button', { name: /save settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable tftp server entirely/i })).toBeInTheDocument()
  })

  it('reverts to the enable prompt immediately after clicking Disable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { 'tftp-server': {} } })))
    const user = userEvent.setup()
    renderWithProviders(<TftpPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('button', { name: /disable tftp server entirely/i }))

    expect(await screen.findByText(/tftp server is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enable tftp server/i })).toBeInTheDocument()
  })

  // Regression test: see store/pendingChanges.ts's latestPendingOp.
  it('can be re-enabled after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<TftpPage />)

    await user.click(await screen.findByRole('button', { name: /enable tftp server/i }))
    await user.click(await screen.findByRole('button', { name: /disable tftp server entirely/i }))
    await screen.findByRole('button', { name: /enable tftp server/i })
    await user.click(screen.getByRole('button', { name: /enable tftp server/i }))

    expect(await screen.findByRole('button', { name: /save settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable tftp server entirely/i })).toBeInTheDocument()
  })
})
