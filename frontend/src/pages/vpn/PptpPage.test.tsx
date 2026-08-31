import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import PptpPage from './PptpPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('PptpPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<PptpPage />)

    expect(await screen.findByText(/pptp is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable pptp/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['vpn', 'pptp'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<PptpPage />)
    expect(await screen.findByText(/failed to load vpn configuration/i)).toBeInTheDocument()
  })

  it('does not show L2TP-only or SSTP-only settings fields', async () => {
    const vpn = { pptp: { 'remote-access': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    renderWithProviders(<PptpPage />)
    await screen.findByLabelText(/outside address/i)

    expect(screen.queryByLabelText(/lns shared secret/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/ipsec pre-shared secret/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/tls sni host name/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^port$/i)).not.toBeInTheDocument()
  })

  it('disables PPTP entirely', async () => {
    const vpn = { pptp: { 'remote-access': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<PptpPage />)

    await user.click(await screen.findByRole('button', { name: /disable pptp entirely/i }))
    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({ op: 'delete', path: ['vpn', 'pptp'] })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the settings form immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<PptpPage />)

    await user.click(await screen.findByRole('button', { name: /enable pptp/i }))

    expect(await screen.findByLabelText(/outside address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable pptp entirely/i })).toBeInTheDocument()
  })

  it('reverts to the enable prompt immediately after clicking Disable, without committing', async () => {
    const vpn = { pptp: { 'remote-access': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<PptpPage />)
    await screen.findByRole('button', { name: /disable pptp entirely/i })

    await user.click(screen.getByRole('button', { name: /disable pptp entirely/i }))

    expect(await screen.findByText(/pptp is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enable pptp/i })).toBeInTheDocument()
  })

  // Regression test: see store/pendingChanges.ts's latestPendingOp.
  it('can be re-enabled after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<PptpPage />)

    await user.click(await screen.findByRole('button', { name: /enable pptp/i }))
    await user.click(await screen.findByRole('button', { name: /disable pptp entirely/i }))
    await screen.findByRole('button', { name: /enable pptp/i })
    await user.click(screen.getByRole('button', { name: /enable pptp/i }))

    expect(await screen.findByLabelText(/outside address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable pptp entirely/i })).toBeInTheDocument()
  })
})
