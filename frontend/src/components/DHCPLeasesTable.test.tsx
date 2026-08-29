import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DHCPSharedNetwork } from '../lib/dhcpConfigTypes'
import type { DHCPLease } from '../lib/vyosApi'
import { usePendingChangesStore } from '../store/pendingChanges'
import DHCPLeasesTable from './DHCPLeasesTable'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

const activeLease: DHCPLease = {
  ipAddress: '192.168.1.134',
  macAddress: '00:50:79:66:68:09',
  state: 'active',
  leaseStart: '2023/11/29 09:51:05',
  leaseEnd: '2023/11/29 10:21:05',
  remaining: '0:24:10',
  pool: 'LAN',
  hostname: 'VPCS1',
  origin: 'local',
  subnet: '192.168.1.0/24',
}

describe('DHCPLeasesTable', () => {
  it('renders a lease with its IP, MAC, hostname, state, pool, and expiry', () => {
    render(<DHCPLeasesTable leases={[activeLease]} />)

    expect(screen.getByText('192.168.1.134')).toBeInTheDocument()
    expect(screen.getByText('00:50:79:66:68:09')).toBeInTheDocument()
    expect(screen.getByText('VPCS1')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('LAN')).toBeInTheDocument()
    expect(screen.getByText('2023/11/29 10:21:05')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no leases', () => {
    render(<DHCPLeasesTable leases={[]} />)
    expect(screen.getByText(/no active leases/i)).toBeInTheDocument()
  })

  it('opens the make-static modal, pre-filled from the lease, and queues mac + ip-address ops on submit', async () => {
    const user = userEvent.setup()
    render(<DHCPLeasesTable leases={[activeLease]} />)

    await user.click(screen.getByRole('button', { name: /make static/i }))

    expect(screen.getByRole('dialog', { name: 'Make static mapping' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^name/i)).toHaveValue('VPCS1')
    expect(screen.getByLabelText(/ip address/i)).toHaveValue('192.168.1.134')
    expect(screen.getByLabelText(/mac address/i)).toHaveValue('00:50:79:66:68:09')

    await user.click(screen.getByRole('button', { name: /queue mapping/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(2)
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: {
            op: 'set',
            path: [
              'service',
              'dhcp-server',
              'shared-network-name',
              'LAN',
              'subnet',
              '192.168.1.0/24',
              'static-mapping',
              'VPCS1',
              'mac',
            ],
            value: '00:50:79:66:68:09',
          },
        }),
        expect.objectContaining({
          op: {
            op: 'set',
            path: [
              'service',
              'dhcp-server',
              'shared-network-name',
              'LAN',
              'subnet',
              '192.168.1.0/24',
              'static-mapping',
              'VPCS1',
              'ip-address',
            ],
            value: '192.168.1.134',
          },
        }),
      ]),
    )
  })

  it('disables "Make static" when the lease has no resolved subnet', () => {
    render(<DHCPLeasesTable leases={[{ ...activeLease, subnet: undefined }]} />)
    expect(screen.getByRole('button', { name: /make static/i })).toBeDisabled()
  })

  it('shows the Pool column by default', () => {
    render(<DHCPLeasesTable leases={[activeLease]} />)
    expect(screen.getByRole('columnheader', { name: 'Pool' })).toBeInTheDocument()
  })

  it('hides the Pool column when showPoolColumn is false', () => {
    render(<DHCPLeasesTable leases={[activeLease]} showPoolColumn={false} />)
    expect(screen.queryByRole('columnheader', { name: 'Pool' })).not.toBeInTheDocument()
    // The pool value itself ("LAN") shouldn't render anywhere in the row either.
    expect(screen.queryByText('LAN')).not.toBeInTheDocument()
  })

  describe('a lease already covered by a static mapping', () => {
    const sharedNetworks: DHCPSharedNetwork[] = [
      {
        name: 'LAN',
        authoritative: true,
        options: { nameServers: [], ntpServers: [], domainSearch: [] },
        subnets: [
          {
            cidr: '192.168.1.0/24',
            options: { nameServers: [], ntpServers: [], domainSearch: [] },
            ranges: [],
            excludes: [],
            staticMappings: [
              { name: 'VPCS1', mac: '00:50:79:66:68:09', ipAddress: '192.168.1.134' },
            ],
          },
        ],
      },
    ]

    it('shows "Edit" instead of "Make static"', () => {
      render(<DHCPLeasesTable leases={[activeLease]} sharedNetworks={sharedNetworks} />)
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /make static/i })).not.toBeInTheDocument()
    })

    it('opens the modal in edit mode, pre-filled from the existing mapping, with a read-only name', async () => {
      const user = userEvent.setup()
      render(<DHCPLeasesTable leases={[activeLease]} sharedNetworks={sharedNetworks} />)

      await user.click(screen.getByRole('button', { name: 'Edit' }))

      expect(screen.getByRole('dialog', { name: 'Edit static mapping' })).toBeInTheDocument()
      expect(screen.getByLabelText(/^name/i)).toHaveValue('VPCS1')
      expect(screen.getByLabelText(/^name/i)).toBeDisabled()
      expect(screen.getByLabelText(/ip address/i)).toHaveValue('192.168.1.134')
      expect(screen.getByLabelText(/mac address/i)).toHaveValue('00:50:79:66:68:09')
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
    })

    it('still shows "Make static" for a different lease with no matching mapping', () => {
      const otherLease = { ...activeLease, macAddress: 'aa:bb:cc:dd:ee:ff', ipAddress: '192.168.1.200' }
      render(<DHCPLeasesTable leases={[otherLease]} sharedNetworks={sharedNetworks} />)
      expect(screen.getByRole('button', { name: /make static/i })).toBeInTheDocument()
    })
  })
})
