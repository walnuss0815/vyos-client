import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DHCPStaticMapping } from '../../lib/dhcpConfigTypes'
import { usePendingChangesStore } from '../../store/pendingChanges'
import StaticMappingSection from './StaticMappingSection'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

const networkName = 'LAN'
const cidr = '192.168.1.0/24'
const basePath = [
  'service',
  'dhcp-server',
  'shared-network-name',
  'LAN',
  'subnet',
  '192.168.1.0/24',
  'static-mapping',
]

const client1: DHCPStaticMapping = { name: 'client1', mac: 'aa:bb:cc:dd:ee:ff', ipAddress: '192.168.1.100' }

describe('StaticMappingSection', () => {
  it('renders existing mappings with their IP and MAC', () => {
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[client1]} />)
    expect(screen.getByText('client1')).toBeInTheDocument()
    expect(screen.getByText('192.168.1.100')).toBeInTheDocument()
    expect(screen.getByText('aa:bb:cc:dd:ee:ff')).toBeInTheDocument()
  })

  it('shows a message when there are no mappings', () => {
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[]} />)
    expect(screen.getByText(/no static mappings/i)).toBeInTheDocument()
  })

  it('queues a delete when deleting a mapping', async () => {
    const user = userEvent.setup()
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[client1]} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: [...basePath, 'client1'] })
  })

  it('creates a new mapping with a name, MAC, and IP address', async () => {
    const user = userEvent.setup()
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[client1]} />)

    await user.click(screen.getByRole('button', { name: '+ Add mapping' }))
    await user.type(screen.getByPlaceholderText('client1'), 'client2')
    await user.type(screen.getByPlaceholderText(/192.168.1.100/), '192.168.1.101')
    await user.type(screen.getByPlaceholderText(/aa:bb:cc:dd:ee:ff/), '11:22:33:44:55:66')
    await user.click(screen.getByRole('button', { name: /queue new mapping/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: { op: 'set', path: [...basePath, 'client2', 'mac'], value: '11:22:33:44:55:66' },
        }),
        expect.objectContaining({
          op: { op: 'set', path: [...basePath, 'client2', 'ip-address'], value: '192.168.1.101' },
        }),
      ]),
    )
  })

  it('requires a MAC or DUID before allowing creation', async () => {
    const user = userEvent.setup()
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[]} />)

    await user.click(screen.getByRole('button', { name: '+ Add mapping' }))
    await user.type(screen.getByPlaceholderText('client1'), 'client2')

    expect(screen.getByText(/mac address or duid is required/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue new mapping/i })).toBeDisabled()
  })

  it('rejects creating a mapping with a name that already exists', async () => {
    const user = userEvent.setup()
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[client1]} />)

    await user.click(screen.getByRole('button', { name: '+ Add mapping' }))
    await user.type(screen.getByPlaceholderText('client1'), 'client1')
    await user.type(screen.getByPlaceholderText(/aa:bb:cc:dd:ee:ff/), '11:22:33:44:55:66')

    expect(screen.getByText(/mapping client1 already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue new mapping/i })).toBeDisabled()
  })

  it('edits an existing mapping, queuing only the changed field', async () => {
    const user = userEvent.setup()
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[client1]} />)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const ipInput = screen.getByDisplayValue('192.168.1.100')
    await user.clear(ipInput)
    await user.type(ipInput, '192.168.1.200')
    await user.click(screen.getByRole('button', { name: /queue changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      {
        id: expect.any(String),
        op: { op: 'set', path: [...basePath, 'client1', 'ip-address'], value: '192.168.1.200' },
        label: expect.any(String),
      },
    ])
  })

  it('disables creation and shows an error for a malformed IP address', async () => {
    const user = userEvent.setup()
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[]} />)

    await user.click(screen.getByRole('button', { name: '+ Add mapping' }))
    await user.type(screen.getByPlaceholderText('client1'), 'client2')
    await user.type(screen.getByPlaceholderText(/aa:bb:cc:dd:ee:ff/), '11:22:33:44:55:66')
    await user.type(screen.getByPlaceholderText(/192.168.1.100/), 'not-an-ip')

    expect(screen.getByText(/not a valid ipv4 address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue new mapping/i })).toBeDisabled()
  })

  it('allows creation with the IP address left blank', async () => {
    const user = userEvent.setup()
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[]} />)

    await user.click(screen.getByRole('button', { name: '+ Add mapping' }))
    await user.type(screen.getByPlaceholderText('client1'), 'client2')
    await user.type(screen.getByPlaceholderText(/aa:bb:cc:dd:ee:ff/), '11:22:33:44:55:66')

    expect(screen.getByRole('button', { name: /queue new mapping/i })).not.toBeDisabled()
  })

  it("warns (without blocking) when the typed IP falls inside the subnet's dynamic range", async () => {
    const user = userEvent.setup()
    render(
      <StaticMappingSection
        networkName={networkName}
        cidr={cidr}
        mappings={[]}
        ranges={[{ id: '0', start: '192.168.1.150', stop: '192.168.1.200' }]}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+ Add mapping' }))
    await user.type(screen.getByPlaceholderText('client1'), 'client2')
    await user.type(screen.getByPlaceholderText(/aa:bb:cc:dd:ee:ff/), '11:22:33:44:55:66')
    await user.type(screen.getByPlaceholderText(/192.168.1.100/), '192.168.1.175')

    expect(screen.getByText(/could collide with a/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue new mapping/i })).not.toBeDisabled()
  })

  it('does not warn when ranges/excludes are not provided at all', async () => {
    const user = userEvent.setup()
    render(<StaticMappingSection networkName={networkName} cidr={cidr} mappings={[]} />)

    await user.click(screen.getByRole('button', { name: '+ Add mapping' }))
    await user.type(screen.getByPlaceholderText('client1'), 'client2')
    await user.type(screen.getByPlaceholderText(/aa:bb:cc:dd:ee:ff/), '11:22:33:44:55:66')
    await user.type(screen.getByPlaceholderText(/192.168.1.100/), '192.168.1.175')

    expect(screen.queryByText(/could collide with a/i)).not.toBeInTheDocument()
  })
})
