import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import SshPage from './SshPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('SshPage', () => {
  it('shows an enable prompt when service ssh is absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<SshPage />)

    expect(await screen.findByText(/ssh access is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable ssh/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'ssh'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<SshPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders settings and chip lists when enabled', async () => {
    const ssh = {
      ssh: {
        port: ['22'],
        'access-control': { allow: { user: ['alice'] } },
        loglevel: 'verbose',
      },
    }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: ssh })))
    renderWithProviders(<SshPage />)

    expect(await screen.findByText('22')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByDisplayValue('verbose')).toBeInTheDocument()
  })

  it('saves settings changes', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { ssh: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<SshPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('checkbox', { name: /disable password authentication/i }))
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'ssh', 'disable-password-authentication'],
    })
  })

  it('disables ssh entirely', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { ssh: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<SshPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('button', { name: /disable ssh entirely/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['service', 'ssh'] })
  })

  // Regression test: the settings form used to stay hidden behind the
  // Enable button until the pending "set service ssh" was committed
  // and refetched - see store/pendingChanges.ts's withPendingEnable.
  it('shows the settings form immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<SshPage />)

    await user.click(await screen.findByRole('button', { name: /enable ssh/i }))

    expect(await screen.findByRole('button', { name: /save settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable ssh entirely/i })).toBeInTheDocument()
  })

  // The mirror case: clicking "Disable SSH entirely" should revert to
  // the Enable prompt immediately too, not keep showing the (now
  // stale) form until the pending delete is committed.
  it('reverts to the enable prompt immediately after clicking Disable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { ssh: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<SshPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('button', { name: /disable ssh entirely/i }))

    expect(await screen.findByText(/ssh access is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enable ssh/i })).toBeInTheDocument()
  })

  // Regression test: see store/pendingChanges.ts's latestPendingOp.
  it('can be re-enabled after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<SshPage />)

    await user.click(await screen.findByRole('button', { name: /enable ssh/i }))
    await user.click(await screen.findByRole('button', { name: /disable ssh entirely/i }))
    await screen.findByRole('button', { name: /enable ssh/i })
    await user.click(screen.getByRole('button', { name: /enable ssh/i }))

    expect(await screen.findByRole('button', { name: /save settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable ssh entirely/i })).toBeInTheDocument()
  })
})
