import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DHCPSharedNetwork } from '../../lib/dhcpConfigTypes'
import type { DHCPLease } from '../../lib/vyosApi'
import { usePendingChangesStore } from '../../store/pendingChanges'
import NetworkCard from './NetworkCard'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

function lease(overrides: Partial<DHCPLease> = {}): DHCPLease {
  return {
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
  }
}

const networkWithSubnet: DHCPSharedNetwork = {
  name: 'LAN',
  authoritative: true,
  options: { defaultRouter: '192.168.1.1', nameServers: [], domainName: undefined, ntpServers: [], domainSearch: [] },
  subnets: [
    {
      cidr: '192.168.1.0/24',
      subnetId: '1',
      options: { nameServers: [], ntpServers: [], domainSearch: [] },
      ranges: [{ id: '0', start: '192.168.1.50', stop: '192.168.1.149' }], // 100 addresses
      excludes: [],
      staticMappings: [],
    },
  ],
}

const emptyNetwork: DHCPSharedNetwork = {
  name: 'GUEST',
  authoritative: false,
  options: { nameServers: [], ntpServers: [], domainSearch: [] },
  subnets: [],
}

describe('NetworkCard', () => {
  it('renders the network name, authoritative badge, and nested subnets', () => {
    render(<NetworkCard network={networkWithSubnet} leases={[]} />)
    expect(screen.getByText('LAN')).toBeInTheDocument()
    expect(screen.getByText('Authoritative')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.0/24')).toBeInTheDocument()
  })

  it('shows a pool-utilization bar sized from the subnet ranges and live leases', () => {
    render(<NetworkCard network={networkWithSubnet} leases={[lease(), lease({ pool: 'WIFI' })]} />)
    expect(screen.getByText('1 / 100 leased')).toBeInTheDocument()
    expect(screen.getByText('1%')).toBeInTheDocument()
  })

  it('shows a message instead of a bar when there are no dynamic ranges', () => {
    render(<NetworkCard network={emptyNetwork} leases={[]} />)
    expect(screen.getByText(/no dynamic ranges configured/i)).toBeInTheDocument()
  })

  it('queues network deletion', async () => {
    const user = userEvent.setup()
    render(<NetworkCard network={emptyNetwork} leases={[]} />)

    await user.click(screen.getByRole('button', { name: /delete network/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['service', 'dhcp-server', 'shared-network-name', 'GUEST'],
    })
  })

  it('queues a diff of changes when editing', async () => {
    const user = userEvent.setup()
    render(<NetworkCard network={networkWithSubnet} leases={[]} />)

    // Two "Edit" buttons exist (the network's own, and the nested
    // subnet's) - the network's is first in the DOM.
    const [networkEditButton] = screen.getAllByRole('button', { name: 'Edit' })
    await user.click(networkEditButton)
    const routerInput = screen.getByDisplayValue('192.168.1.1')
    await user.clear(routerInput)
    await user.type(routerInput, '192.168.1.254')
    await user.click(screen.getByRole('button', { name: /queue changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      {
        id: expect.any(String),
        op: {
          op: 'set',
          path: ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'option', 'default-router'],
          value: '192.168.1.254',
        },
        label: expect.any(String),
      },
    ])
  })

  it('creates a new subnet with a CIDR and subnet ID', async () => {
    const user = userEvent.setup()
    render(<NetworkCard network={emptyNetwork} leases={[]} />)

    await user.click(screen.getByRole('button', { name: '+ Add subnet' }))
    await user.type(screen.getByPlaceholderText('192.168.1.0/24'), '10.0.0.0/24')
    await user.type(screen.getByPlaceholderText(/must be unique/i), '2')
    await user.click(screen.getByRole('button', { name: /queue subnet creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['service', 'dhcp-server', 'shared-network-name', 'GUEST', 'subnet', '10.0.0.0/24', 'subnet-id'],
      value: '2',
    })
  })

  it('rejects an invalid CIDR', async () => {
    const user = userEvent.setup()
    render(<NetworkCard network={emptyNetwork} leases={[]} />)

    await user.click(screen.getByRole('button', { name: '+ Add subnet' }))
    await user.type(screen.getByPlaceholderText('192.168.1.0/24'), 'not-a-cidr')
    await user.type(screen.getByPlaceholderText(/must be unique/i), '2')

    expect(screen.getByText(/must be a valid cidr/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue subnet creation/i })).toBeDisabled()
  })

  it('rejects a CIDR that already exists on this network', async () => {
    const user = userEvent.setup()
    render(<NetworkCard network={networkWithSubnet} leases={[]} />)

    await user.click(screen.getByRole('button', { name: '+ Add subnet' }))
    await user.type(screen.getByPlaceholderText('192.168.1.0/24'), '192.168.1.0/24')
    await user.type(screen.getByPlaceholderText(/must be unique/i), '2')

    expect(screen.getByText(/subnet 192.168.1.0\/24 already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue subnet creation/i })).toBeDisabled()
  })
})
