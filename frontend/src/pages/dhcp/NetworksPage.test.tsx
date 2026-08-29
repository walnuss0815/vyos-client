import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import NetworksPage from './NetworksPage'

const DHCP_CONFIG = {
  'shared-network-name': {
    LAN: {
      authoritative: null,
      subnet: {
        '192.168.1.0/24': {
          'subnet-id': '1',
          range: { '0': { start: '192.168.1.50', stop: '192.168.1.149' } }, // 100 addresses
        },
      },
    },
  },
}

const makeLease = (overrides: Record<string, unknown> = {}) => ({
  ipAddress: '192.168.1.50',
  macAddress: '00:11:22:33:44:55',
  state: 'active',
  leaseStart: '',
  leaseEnd: '',
  remaining: '',
  pool: 'LAN',
  hostname: '',
  origin: 'local',
  ...overrides,
})

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(
    http.get('/api/config/tree', () => HttpResponse.json({ data: DHCP_CONFIG })),
    http.get('/api/dhcp/leases', () => HttpResponse.json({ leases: [makeLease()] })),
  )
})

describe('NetworksPage', () => {
  it('renders shared networks with their subnets and a pool-utilization bar reflecting live leases', async () => {
    renderWithProviders(<NetworksPage />)

    expect(await screen.findByText('LAN')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.0/24')).toBeInTheDocument()
    expect(screen.getByText('1 / 100 leased')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no shared networks', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    renderWithProviders(<NetworksPage />)
    expect(await screen.findByText(/no shared networks configured yet/i)).toBeInTheDocument()
  })

  it('shows an error message when the config query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<NetworksPage />)
    expect(await screen.findByText(/failed to load dhcp configuration/i)).toBeInTheDocument()
  })

  it('shows an error message when the leases query fails', async () => {
    server.use(http.get('/api/dhcp/leases', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<NetworksPage />)
    expect(await screen.findByText(/failed to load dhcp configuration/i)).toBeInTheDocument()
  })

  it('creates a new network with a name, first subnet, and subnet ID', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NetworksPage />)
    await screen.findByText('LAN')

    await user.click(screen.getByRole('button', { name: /new network/i }))
    await user.type(screen.getByPlaceholderText('LAN'), 'GUEST')
    await user.type(screen.getByPlaceholderText('192.168.1.0/24'), '10.0.0.0/24')
    await user.type(screen.getByPlaceholderText('1'), '2')
    await user.click(screen.getByRole('button', { name: /queue network creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['service', 'dhcp-server', 'shared-network-name', 'GUEST', 'subnet', '10.0.0.0/24', 'subnet-id'],
      value: '2',
    })
  })

  it('also queues an initial range when both optional range fields are filled in', async () => {
    // VyOS refuses to commit a subnet with neither an address range
    // nor a static mapping, and a brand new subnet doesn't exist
    // server-side (so RangeList/StaticMappingSection can't add either
    // one) until this form's own op has already been committed - these
    // optional fields let a range be queued in the SAME commit as the
    // subnet itself, avoiding that deadlock.
    const user = userEvent.setup()
    renderWithProviders(<NetworksPage />)
    await screen.findByText('LAN')

    await user.click(screen.getByRole('button', { name: /new network/i }))
    await user.type(screen.getByPlaceholderText('LAN'), 'GUEST')
    await user.type(screen.getByPlaceholderText('192.168.1.0/24'), '10.0.0.0/24')
    await user.type(screen.getByPlaceholderText('1'), '2')
    await user.type(screen.getByPlaceholderText('192.168.1.50'), '10.0.0.50')
    await user.type(screen.getByPlaceholderText('192.168.1.250'), '10.0.0.250')
    await user.click(screen.getByRole('button', { name: /queue network creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual([
      {
        op: 'set',
        path: ['service', 'dhcp-server', 'shared-network-name', 'GUEST', 'subnet', '10.0.0.0/24', 'subnet-id'],
        value: '2',
      },
      {
        op: 'set',
        path: [
          'service',
          'dhcp-server',
          'shared-network-name',
          'GUEST',
          'subnet',
          '10.0.0.0/24',
          'range',
          '0',
          'start',
        ],
        value: '10.0.0.50',
      },
      {
        op: 'set',
        path: [
          'service',
          'dhcp-server',
          'shared-network-name',
          'GUEST',
          'subnet',
          '10.0.0.0/24',
          'range',
          '0',
          'stop',
        ],
        value: '10.0.0.250',
      },
    ])
  })

  it('does not queue a range when only one of the two optional range fields is filled in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NetworksPage />)
    await screen.findByText('LAN')

    await user.click(screen.getByRole('button', { name: /new network/i }))
    await user.type(screen.getByPlaceholderText('LAN'), 'GUEST')
    await user.type(screen.getByPlaceholderText('192.168.1.0/24'), '10.0.0.0/24')
    await user.type(screen.getByPlaceholderText('1'), '2')
    await user.type(screen.getByPlaceholderText('192.168.1.50'), '10.0.0.50')
    await user.click(screen.getByRole('button', { name: /queue network creation/i }))

    expect(usePendingChangesStore.getState().changes).toHaveLength(1)
  })

  it('rejects creating a network with a name that already exists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NetworksPage />)
    await screen.findByText('LAN')

    await user.click(screen.getByRole('button', { name: /new network/i }))
    await user.type(screen.getByPlaceholderText('LAN'), 'LAN')
    await user.type(screen.getByPlaceholderText('192.168.1.0/24'), '10.0.0.0/24')
    await user.type(screen.getByPlaceholderText('1'), '2')

    expect(screen.getByText(/network lan already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue network creation/i })).toBeDisabled()
  })

  it('requires all three fields before allowing network creation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NetworksPage />)
    await screen.findByText('LAN')

    await user.click(screen.getByRole('button', { name: /new network/i }))
    await user.type(screen.getByPlaceholderText('LAN'), 'GUEST')

    expect(screen.getByRole('button', { name: /queue network creation/i })).toBeDisabled()
  })
})
