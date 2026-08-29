import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DHCPRange } from '../../lib/dhcpConfigTypes'
import { usePendingChangesStore } from '../../store/pendingChanges'
import RangeList from './RangeList'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

const networkName = 'LAN'
const cidr = '192.168.1.0/24'
const basePath = ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'subnet', '192.168.1.0/24', 'range']

describe('RangeList', () => {
  it('renders each range with its start/stop', () => {
    const ranges: DHCPRange[] = [{ id: '0', start: '192.168.1.50', stop: '192.168.1.250' }]
    render(<RangeList networkName={networkName} cidr={cidr} ranges={ranges} />)
    expect(screen.getByText('192.168.1.50 – 192.168.1.250')).toBeInTheDocument()
  })

  it('shows a message when there are no ranges', () => {
    render(<RangeList networkName={networkName} cidr={cidr} ranges={[]} />)
    expect(screen.getByText(/no ranges configured/i)).toBeInTheDocument()
  })

  it('adds a range with the next unused numeric ID', async () => {
    const user = userEvent.setup()
    const ranges: DHCPRange[] = [{ id: '0', start: '192.168.1.50', stop: '192.168.1.100' }]
    render(<RangeList networkName={networkName} cidr={cidr} ranges={ranges} />)

    await user.type(screen.getByPlaceholderText(/start/i), '192.168.1.150')
    await user.type(screen.getByPlaceholderText(/stop/i), '192.168.1.200')
    await user.click(screen.getByRole('button', { name: /add range/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      expect.objectContaining({
        op: { op: 'set', path: [...basePath, '1', 'start'], value: '192.168.1.150' },
      }),
      expect.objectContaining({
        op: { op: 'set', path: [...basePath, '1', 'stop'], value: '192.168.1.200' },
      }),
    ])
  })

  it('starts numbering at 0 for the first range', async () => {
    const user = userEvent.setup()
    render(<RangeList networkName={networkName} cidr={cidr} ranges={[]} />)

    await user.type(screen.getByPlaceholderText(/start/i), '192.168.1.50')
    await user.type(screen.getByPlaceholderText(/stop/i), '192.168.1.250')
    await user.click(screen.getByRole('button', { name: /add range/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes[0].op.path).toEqual([...basePath, '0', 'start'])
  })

  it('queues a delete for the whole range when removed', async () => {
    const user = userEvent.setup()
    const ranges: DHCPRange[] = [{ id: '0', start: '192.168.1.50', stop: '192.168.1.100' }]
    render(<RangeList networkName={networkName} cidr={cidr} ranges={ranges} />)

    await user.click(screen.getByLabelText('Remove range 0'))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: [...basePath, '0'] })
  })

  it('disables Add range until both start and stop are filled in', async () => {
    const user = userEvent.setup()
    render(<RangeList networkName={networkName} cidr={cidr} ranges={[]} />)
    expect(screen.getByRole('button', { name: /add range/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/start/i), '192.168.1.50')
    expect(screen.getByRole('button', { name: /add range/i })).toBeDisabled()
  })
})
