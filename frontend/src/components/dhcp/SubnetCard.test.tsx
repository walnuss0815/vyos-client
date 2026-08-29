import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DHCPSubnet } from '../../lib/dhcpConfigTypes'
import { usePendingChangesStore } from '../../store/pendingChanges'
import SubnetCard from './SubnetCard'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

const networkName = 'LAN'

const baseSubnet: DHCPSubnet = {
  cidr: '192.168.1.0/24',
  subnetId: '1',
  lease: 3600,
  options: {
    defaultRouter: '192.168.1.1',
    nameServers: ['192.168.1.1'],
    domainName: 'example.com',
    ntpServers: [],
    domainSearch: [],
  },
  ranges: [{ id: '0', start: '192.168.1.50', stop: '192.168.1.250' }],
  excludes: ['192.168.1.99'],
  staticMappings: [{ name: 'client1', mac: 'aa:bb:cc:dd:ee:ff', ipAddress: '192.168.1.100' }],
}

describe('SubnetCard', () => {
  it('renders subnet-id and lease in the summary', () => {
    render(<SubnetCard networkName={networkName} subnet={baseSubnet} />)
    expect(screen.getByText('192.168.1.0/24')).toBeInTheDocument()
    expect(screen.getByText(/subnet-id 1/)).toBeInTheDocument()
    expect(screen.getByText(/lease 3600s/)).toBeInTheDocument()
  })

  it('defaults the displayed lease to 86400 when unset', () => {
    render(<SubnetCard networkName={networkName} subnet={{ ...baseSubnet, lease: undefined }} />)
    expect(screen.getByText(/lease 86400s/)).toBeInTheDocument()
  })

  it('renders nested ranges, excludes, and static mappings', () => {
    render(<SubnetCard networkName={networkName} subnet={baseSubnet} />)
    expect(screen.getByText('192.168.1.50 – 192.168.1.250')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.99')).toBeInTheDocument()
    expect(screen.getByText('client1')).toBeInTheDocument()
  })

  it('queues subnet deletion', async () => {
    const user = userEvent.setup()
    render(<SubnetCard networkName={networkName} subnet={baseSubnet} />)

    await user.click(screen.getByRole('button', { name: /delete subnet/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'subnet', '192.168.1.0/24'],
    })
  })

  it('queues a diff of changes when editing', async () => {
    const user = userEvent.setup()
    render(<SubnetCard networkName={networkName} subnet={baseSubnet} />)

    // Two "Edit" buttons exist (the subnet's own, and the nested
    // static mapping's) - the subnet's is first in the DOM.
    const [subnetEditButton] = screen.getAllByRole('button', { name: 'Edit' })
    await user.click(subnetEditButton)
    const leaseInput = screen.getByDisplayValue('3600')
    await user.clear(leaseInput)
    await user.type(leaseInput, '7200')
    await user.click(screen.getByRole('button', { name: /queue changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      {
        id: expect.any(String),
        op: {
          op: 'set',
          path: ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'subnet', '192.168.1.0/24', 'lease'],
          value: '7200',
        },
        label: expect.any(String),
      },
    ])
  })
})
