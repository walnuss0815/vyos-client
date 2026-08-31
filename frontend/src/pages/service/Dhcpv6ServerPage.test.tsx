import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import Dhcpv6ServerPage from './Dhcpv6ServerPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('Dhcpv6ServerPage', () => {
  it('shows an enable prompt when service dhcpv6-server is absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<Dhcpv6ServerPage />)

    expect(await screen.findByText(/dhcpv6 server is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable dhcpv6 server/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'dhcpv6-server'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<Dhcpv6ServerPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders a shared network and lets a subnet be added, then a range added within it', async () => {
    const dhcpv6 = { 'dhcpv6-server': { 'shared-network-name': { LAN: {} } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: dhcpv6 })))
    const user = userEvent.setup()
    renderWithProviders(<Dhcpv6ServerPage />)

    expect(await screen.findByText('LAN')).toBeInTheDocument()

    const card = screen.getByText('LAN').closest('div.rounded-xl')
    if (!card) throw new Error('network card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /subnets/i }))
    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add subnet/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText('2001:db8::/64'), '2001:db8::/64')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add subnet$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN', 'subnet', '2001:db8::/64'],
    })
  })

  it('creates a new shared network', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { 'dhcpv6-server': {} } })))
    const user = userEvent.setup()
    renderWithProviders(<Dhcpv6ServerPage />)
    await screen.findByRole('button', { name: /\+ new shared network/i })

    await user.click(screen.getByRole('button', { name: /\+ new shared network/i }))
    await user.type(screen.getByLabelText(/^name/i), 'LAN')
    await user.click(screen.getByRole('button', { name: /queue creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'dhcpv6-server', 'shared-network-name', 'LAN'],
    })
  })

  it('disables the DHCPv6 server entirely', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { 'dhcpv6-server': {} } })))
    const user = userEvent.setup()
    renderWithProviders(<Dhcpv6ServerPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('button', { name: /disable dhcpv6 server entirely/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['service', 'dhcpv6-server'] })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the settings form immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<Dhcpv6ServerPage />)

    await user.click(await screen.findByRole('button', { name: /enable dhcpv6 server/i }))

    expect(await screen.findByRole('button', { name: /save settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable dhcpv6 server entirely/i })).toBeInTheDocument()
  })
})
