import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePendingChangesStore } from '../../store/pendingChanges'
import AddressChips from './AddressChips'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

const basePath = ['interfaces', 'ethernet', 'eth0']
const pathLabel = 'interfaces ethernet eth0 address'

describe('AddressChips', () => {
  it('renders each address as a removable chip', () => {
    render(<AddressChips addresses={['192.0.2.1/24', 'dhcp']} basePath={basePath} pathLabel={pathLabel} />)
    expect(screen.getByText('192.0.2.1/24')).toBeInTheDocument()
    expect(screen.getByText('dhcp')).toBeInTheDocument()
  })

  it('shows a placeholder message when there are no addresses', () => {
    render(<AddressChips addresses={[]} basePath={basePath} pathLabel={pathLabel} />)
    expect(screen.getByText(/no addresses configured/i)).toBeInTheDocument()
  })

  it('queues a set op when adding a typed address', async () => {
    const user = userEvent.setup()
    render(<AddressChips addresses={[]} basePath={basePath} pathLabel={pathLabel} />)

    await user.type(screen.getByPlaceholderText('192.0.2.1/24'), '203.0.113.5/24')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: [...basePath, 'address'],
      value: '203.0.113.5/24',
    })
  })

  it('queues a set op for dhcp/dhcpv6 quick-add buttons', async () => {
    const user = userEvent.setup()
    render(<AddressChips addresses={[]} basePath={basePath} pathLabel={pathLabel} />)

    await user.click(screen.getByRole('button', { name: '+ DHCP' }))
    await user.click(screen.getByRole('button', { name: '+ DHCPv6' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op.value)).toEqual(['dhcp', 'dhcpv6'])
  })

  it('queues a delete op when removing an address', async () => {
    const user = userEvent.setup()
    render(<AddressChips addresses={['192.0.2.1/24']} basePath={basePath} pathLabel={pathLabel} />)

    await user.click(screen.getByLabelText('Remove address 192.0.2.1/24'))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: [...basePath, 'address'],
      value: '192.0.2.1/24',
    })
  })

  it('disables the Add button until something is typed', () => {
    render(<AddressChips addresses={[]} basePath={basePath} pathLabel={pathLabel} />)
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})
