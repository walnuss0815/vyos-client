import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DHCPStaticMapping, DHCPSubnet } from '../../lib/dhcpConfigTypes'
import type { DHCPLease } from '../../lib/vyosApi'
import { usePendingChangesStore } from '../../store/pendingChanges'
import MakeStaticModal from './MakeStaticModal'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

const lease: DHCPLease = {
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

const basePath = [
  'service',
  'dhcp-server',
  'shared-network-name',
  'LAN',
  'subnet',
  '192.168.1.0/24',
  'static-mapping',
]

describe('MakeStaticModal', () => {
  it('pre-fills name/MAC/IP from the lease, and DUID blank', () => {
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={() => {}} />)
    expect(screen.getByLabelText(/^name/i)).toHaveValue('VPCS1')
    expect(screen.getByLabelText(/ip address/i)).toHaveValue('192.168.1.134')
    expect(screen.getByLabelText(/mac address/i)).toHaveValue('00:50:79:66:68:09')
    expect(screen.getByLabelText(/duid/i)).toHaveValue('')
  })

  it('queues mac + ip-address ops under the suggested name on submit', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: /queue mapping/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: { op: 'set', path: [...basePath, 'VPCS1', 'mac'], value: '00:50:79:66:68:09' },
        }),
        expect.objectContaining({
          op: { op: 'set', path: [...basePath, 'VPCS1', 'ip-address'], value: '192.168.1.134' },
        }),
      ]),
    )
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('lets the name/MAC/IP be edited before submitting', async () => {
    const user = userEvent.setup()
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={() => {}} />)

    await user.clear(screen.getByLabelText(/^name/i))
    await user.type(screen.getByLabelText(/^name/i), 'my-device')
    await user.clear(screen.getByLabelText(/ip address/i))
    await user.type(screen.getByLabelText(/ip address/i), '192.168.1.200')
    await user.click(screen.getByRole('button', { name: /queue mapping/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: { op: 'set', path: [...basePath, 'my-device', 'ip-address'], value: '192.168.1.200' },
        }),
      ]),
    )
  })

  it('disables submit and shows an error when the name already exists', () => {
    render(<MakeStaticModal lease={lease} existingNames={['VPCS1']} onDone={() => {}} />)
    expect(screen.getByText(/mapping VPCS1 already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue mapping/i })).toBeDisabled()
  })

  it('disables submit and shows an error when both MAC and DUID are cleared', async () => {
    const user = userEvent.setup()
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={() => {}} />)

    await user.clear(screen.getByLabelText(/mac address/i))

    expect(screen.getByText(/a mac address or duid is required/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue mapping/i })).toBeDisabled()
  })

  it('allows submitting with only a DUID and no MAC address', async () => {
    const user = userEvent.setup()
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={() => {}} />)

    await user.clear(screen.getByLabelText(/mac address/i))
    await user.type(screen.getByLabelText(/duid/i), '00:01:02:03')

    expect(screen.getByRole('button', { name: /queue mapping/i })).not.toBeDisabled()
  })

  it('calls onDone without queuing anything when cancelled', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onDone).toHaveBeenCalledOnce()
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  it('notes that the device needs to renew its lease to pick up a new address', () => {
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={() => {}} />)
    expect(screen.getByText(/won't actually start using a new address here/i)).toBeInTheDocument()
  })
})

describe('MakeStaticModal - IP address validation', () => {
  it('disables submit and shows an error for a malformed IP address', async () => {
    const user = userEvent.setup()
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={() => {}} />)

    await user.clear(screen.getByLabelText(/ip address/i))
    await user.type(screen.getByLabelText(/ip address/i), 'not-an-ip')

    expect(screen.getByText(/not a valid ipv4 address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue mapping/i })).toBeDisabled()
  })

  it('allows submitting with the IP address left blank (falls back to the dynamic pool)', async () => {
    const user = userEvent.setup()
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={() => {}} />)

    await user.clear(screen.getByLabelText(/ip address/i))

    expect(screen.queryByText(/not a valid ipv4 address/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue mapping/i })).not.toBeDisabled()
  })

  const subnet: DHCPSubnet = {
    cidr: '192.168.1.0/24',
    options: { nameServers: [], ntpServers: [], domainSearch: [] },
    ranges: [{ id: '0', start: '192.168.1.150', stop: '192.168.1.200' }],
    excludes: [],
    staticMappings: [],
  }

  it('warns when the typed IP falls inside the subnet\'s own dynamic range', async () => {
    const user = userEvent.setup()
    render(<MakeStaticModal lease={lease} subnet={subnet} existingNames={[]} onDone={() => {}} />)

    await user.clear(screen.getByLabelText(/ip address/i))
    await user.type(screen.getByLabelText(/ip address/i), '192.168.1.175')

    expect(screen.getByText(/could collide with a/i)).toBeInTheDocument()
    // A warning, not a blocking error - submit stays enabled.
    expect(screen.getByRole('button', { name: /queue mapping/i })).not.toBeDisabled()
  })

  it('does not warn when the typed IP falls outside the dynamic range', async () => {
    const user = userEvent.setup()
    render(<MakeStaticModal lease={lease} subnet={subnet} existingNames={[]} onDone={() => {}} />)

    await user.clear(screen.getByLabelText(/ip address/i))
    await user.type(screen.getByLabelText(/ip address/i), '192.168.1.10')

    expect(screen.queryByText(/could collide with a/i)).not.toBeInTheDocument()
  })

  it('does not warn when no subnet is given at all', async () => {
    const user = userEvent.setup()
    render(<MakeStaticModal lease={lease} existingNames={[]} onDone={() => {}} />)

    await user.clear(screen.getByLabelText(/ip address/i))
    await user.type(screen.getByLabelText(/ip address/i), '192.168.1.175')

    expect(screen.queryByText(/could collide with a/i)).not.toBeInTheDocument()
  })
})

describe('MakeStaticModal - editing an existing mapping', () => {
  const mapping: DHCPStaticMapping = {
    name: 'VPCS1',
    mac: '00:50:79:66:68:09',
    ipAddress: '192.168.1.134',
  }

  it('shows "Edit static mapping" as the title and pre-fills from the mapping', () => {
    render(<MakeStaticModal lease={lease} mapping={mapping} existingNames={['VPCS1']} onDone={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Edit static mapping' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^name/i)).toHaveValue('VPCS1')
    expect(screen.getByLabelText(/ip address/i)).toHaveValue('192.168.1.134')
    expect(screen.getByLabelText(/mac address/i)).toHaveValue('00:50:79:66:68:09')
  })

  it('disables the name field - VyOS tagNode identifiers are not renamed in place', () => {
    render(<MakeStaticModal lease={lease} mapping={mapping} existingNames={['VPCS1']} onDone={() => {}} />)
    expect(screen.getByLabelText(/^name/i)).toBeDisabled()
  })

  it('does not treat the mapping\'s own name as a collision', () => {
    render(<MakeStaticModal lease={lease} mapping={mapping} existingNames={['VPCS1']} onDone={() => {}} />)
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled()
  })

  it('only queues an op for the field that actually changed', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<MakeStaticModal lease={lease} mapping={mapping} existingNames={['VPCS1']} onDone={onDone} />)

    await user.clear(screen.getByLabelText(/ip address/i))
    await user.type(screen.getByLabelText(/ip address/i), '192.168.1.200')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: [...basePath, 'VPCS1', 'ip-address'],
      value: '192.168.1.200',
    })
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('queues nothing when nothing was changed', async () => {
    const user = userEvent.setup()
    render(<MakeStaticModal lease={lease} mapping={mapping} existingNames={['VPCS1']} onDone={() => {}} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })
})
