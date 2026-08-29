import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { InterfaceVlan } from '../../lib/interfaceTypes'
import { usePendingChangesStore } from '../../store/pendingChanges'
import VlanSection from './VlanSection'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

const parentPath = ['interfaces', 'ethernet', 'eth0']
const parentPathLabel = 'interfaces ethernet eth0'

const vlan10: InterfaceVlan = {
  vlanId: '10',
  description: 'Guest',
  disabled: false,
  addresses: ['192.0.2.1/24'],
}

describe('VlanSection', () => {
  it('renders existing VLANs with their description and addresses', () => {
    render(<VlanSection parentPath={parentPath} parentPathLabel={parentPathLabel} vlans={[vlan10]} vrfOptions={[]} />)
    expect(screen.getByText('vif 10')).toBeInTheDocument()
    expect(screen.getByText('Guest')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.1/24')).toBeInTheDocument()
  })

  it('shows a message when there are no VLANs', () => {
    render(<VlanSection parentPath={parentPath} parentPathLabel={parentPathLabel} vlans={[]} vrfOptions={[]} />)
    expect(screen.getByText(/no vlan sub-interfaces/i)).toBeInTheDocument()
  })

  it('queues a delete op when deleting a VLAN', async () => {
    const user = userEvent.setup()
    render(<VlanSection parentPath={parentPath} parentPathLabel={parentPathLabel} vlans={[vlan10]} vrfOptions={[]} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: [...parentPath, 'vif', '10'] })
  })

  it('creates a new VLAN with an ID and initial address', async () => {
    const user = userEvent.setup()
    render(<VlanSection parentPath={parentPath} parentPathLabel={parentPathLabel} vlans={[vlan10]} vrfOptions={[]} />)

    await user.click(screen.getByRole('button', { name: '+ Add VLAN' }))
    await user.type(screen.getByPlaceholderText('10'), '20')
    await user.type(screen.getByPlaceholderText('192.0.2.1/24, dhcp, or dhcpv6'), 'dhcp')
    await user.click(screen.getByRole('button', { name: /queue new vlan/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: { op: 'set', path: [...parentPath, 'vif', '20', 'address'], value: 'dhcp' },
        }),
      ]),
    )
  })

  it('rejects creating a VLAN with an ID that already exists', async () => {
    const user = userEvent.setup()
    render(<VlanSection parentPath={parentPath} parentPathLabel={parentPathLabel} vlans={[vlan10]} vrfOptions={[]} />)

    await user.click(screen.getByRole('button', { name: '+ Add VLAN' }))
    await user.type(screen.getByPlaceholderText('10'), '10')

    expect(screen.getByText(/vlan 10 already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue new vlan/i })).toBeDisabled()
  })

  it('edits an existing VLAN, queuing only the changed field', async () => {
    const user = userEvent.setup()
    render(<VlanSection parentPath={parentPath} parentPathLabel={parentPathLabel} vlans={[vlan10]} vrfOptions={[]} />)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const descriptionInput = screen.getByDisplayValue('Guest')
    await user.clear(descriptionInput)
    await user.type(descriptionInput, 'Guest Wi-Fi')
    await user.click(screen.getByRole('button', { name: /queue changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      {
        id: expect.any(String),
        op: { op: 'set', path: [...parentPath, 'vif', '10', 'description'], value: 'Guest Wi-Fi' },
        label: expect.any(String),
      },
    ])
  })

  it('offers a VRF picker populated from vrfOptions', async () => {
    const user = userEvent.setup()
    render(
      <VlanSection
        parentPath={parentPath}
        parentPathLabel={parentPathLabel}
        vlans={[]}
        vrfOptions={['red', 'blue']}
      />,
    )

    await user.click(screen.getByRole('button', { name: '+ Add VLAN' }))
    expect(screen.getByRole('option', { name: 'red' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'blue' })).toBeInTheDocument()
  })
})
