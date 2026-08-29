import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import IpsecRemoteAccessPage from './IpsecRemoteAccessPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('IpsecRemoteAccessPage', () => {
  it('renders empty state when vpn is absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    renderWithProviders(<IpsecRemoteAccessPage />)
    expect(await screen.findByText(/no ikev2 connections configured yet/i)).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<IpsecRemoteAccessPage />)
    expect(await screen.findByText(/failed to load vpn configuration/i)).toBeInTheDocument()
  })

  it('creates a new connection', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecRemoteAccessPage />)
    await screen.findByRole('button', { name: /\+ new connection/i })

    await user.click(screen.getByRole('button', { name: /\+ new connection/i }))
    await user.type(screen.getByLabelText(/^name/i), 'RW')
    await user.click(screen.getByRole('button', { name: /queue creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'remote-access', 'connection', 'RW'],
    })
  })

  it('adds a local user to an existing connection without leaking the password', async () => {
    const vpn = { ipsec: { 'remote-access': { connection: { RW: {} } } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecRemoteAccessPage />)

    expect(await screen.findByText('RW')).toBeInTheDocument()
    const card = screen.getByText('RW').closest('div.rounded-xl')
    if (!card) throw new Error('connection card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /local users/i }))
    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add user/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText('username'), 'alice')
    await user.type(within(card as HTMLElement).getByPlaceholderText('password'), 'super-secret')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'remote-access', 'connection', 'RW', 'authentication', 'local-users', 'username', 'alice', 'password'],
      value: 'super-secret',
    })
  })

  it('adds a pool', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecRemoteAccessPage />)
    await screen.findByRole('button', { name: /\+ add pool/i })

    await user.click(screen.getByRole('button', { name: /\+ add pool/i }))
    await user.type(screen.getByPlaceholderText('pool name'), 'RW-POOL')
    await user.type(screen.getByPlaceholderText(/10.10.0.0\/24/i), '10.10.0.0/24')
    await user.click(screen.getByRole('button', { name: /^add pool$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'remote-access', 'pool', 'RW-POOL', 'prefix'],
      value: '10.10.0.0/24',
    })
  })
})
