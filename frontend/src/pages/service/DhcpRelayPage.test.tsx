import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import DhcpRelayPage from './DhcpRelayPage'

const SERVICE = {
  'dhcp-relay': { 'listen-interface': ['eth1'], server: ['192.0.2.1'] },
  'dhcpv6-relay': { 'listen-interface': { eth0: { address: 'fe80::1' } } },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: SERVICE })))
})

describe('DhcpRelayPage', () => {
  it('renders v4 and v6 relay settings', async () => {
    renderWithProviders(<DhcpRelayPage />)

    expect(await screen.findByText('eth1')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.1')).toBeInTheDocument()
    expect(screen.getByText(/eth0/)).toBeInTheDocument()
    expect(screen.getByText(/fe80::1/)).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<DhcpRelayPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('saves v4 relay-options settings', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DhcpRelayPage />)
    await screen.findByText('eth1')

    const v4Section = screen.getByText('DHCP relay (IPv4)').closest('div')
    if (!v4Section) throw new Error('DHCP relay (IPv4) section not found')
    await user.type(within(v4Section as HTMLElement).getByPlaceholderText('10'), '5')
    await user.click(within(v4Section as HTMLElement).getByRole('button', { name: /save settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'dhcp-relay', 'relay-options', 'hop-count'],
      value: '5',
    })
  })

  it('adds a DHCPv6 relay upstream interface', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DhcpRelayPage />)
    await screen.findByText('eth1')

    const v6Section = screen.getByText('DHCPv6 relay').closest('div')
    if (!v6Section) throw new Error('DHCPv6 relay section not found')
    const upstreamSection = within(v6Section as HTMLElement).getByText('Upstream interfaces').closest('div')
    if (!upstreamSection) throw new Error('upstream interfaces sub-section not found')
    await user.click(within(upstreamSection as HTMLElement).getByRole('button', { name: /\+ add/i }))
    await user.type(within(upstreamSection as HTMLElement).getByPlaceholderText('eth1'), 'eth2')
    await user.click(within(upstreamSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'dhcpv6-relay', 'upstream-interface', 'eth2'],
    })
  })
})
