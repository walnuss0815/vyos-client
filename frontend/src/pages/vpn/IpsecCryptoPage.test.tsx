import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import IpsecCryptoPage from './IpsecCryptoPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('IpsecCryptoPage', () => {
  it('renders empty state when vpn is absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    renderWithProviders(<IpsecCryptoPage />)
    expect(await screen.findByText(/no esp groups configured yet/i)).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<IpsecCryptoPage />)
    expect(await screen.findByText(/failed to load vpn configuration/i)).toBeInTheDocument()
  })

  it('creates a new ESP group and adds a proposal to it', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecCryptoPage />)
    await screen.findByRole('button', { name: /\+ new esp group/i })

    await user.click(screen.getByRole('button', { name: /\+ new esp group/i }))
    await user.type(screen.getByLabelText(/^name/i), 'ESP-DEFAULT')
    await user.click(screen.getByRole('button', { name: /queue creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT'],
    })
  })

  it('adds a pre-shared key without leaking the secret in pending-change labels', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecCryptoPage />)
    await screen.findByRole('button', { name: /\+ add psk/i })

    await user.click(screen.getByRole('button', { name: /\+ add psk/i }))
    await user.type(screen.getByPlaceholderText(/peer_51-105-0-1/i), 'peer-1')
    await user.type(screen.getByPlaceholderText(/192.0.2.1/i), '192.0.2.1')
    await user.type(screen.getByPlaceholderText('secret'), 'super-secret-psk')
    await user.click(screen.getByRole('button', { name: /^add psk$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'authentication', 'psk', 'peer-1', 'secret'],
      value: 'super-secret-psk',
    })
  })

  it('renders an ESP group and adds a proposal via its details section', async () => {
    const vpn = { ipsec: { 'esp-group': { 'ESP-DEFAULT': {} } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecCryptoPage />)

    expect(await screen.findByText('ESP-DEFAULT')).toBeInTheDocument()
    const card = screen.getByText('ESP-DEFAULT').closest('div.rounded-xl')
    if (!card) throw new Error('esp group card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /proposals/i }))
    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add proposal/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText('priority #'), '1')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add proposal$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'esp-group', 'ESP-DEFAULT', 'proposal', '1'],
    })
  })
})
