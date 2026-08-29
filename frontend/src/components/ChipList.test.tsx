import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePendingChangesStore } from '../store/pendingChanges'
import ChipList from './ChipList'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

const basePath = ['service', 'dhcp-server', 'shared-network-name', 'LAN', 'option']
const pathLabel = 'service dhcp-server shared-network-name LAN option name-server'

describe('ChipList', () => {
  it('renders each value as a removable chip', () => {
    render(<ChipList values={['1.1.1.1', '8.8.8.8']} basePath={basePath} leaf="name-server" pathLabel={pathLabel} />)
    expect(screen.getByText('1.1.1.1')).toBeInTheDocument()
    expect(screen.getByText('8.8.8.8')).toBeInTheDocument()
  })

  it('shows a placeholder message when there are no values', () => {
    render(<ChipList values={[]} basePath={basePath} leaf="name-server" pathLabel={pathLabel} />)
    expect(screen.getByText(/none configured/i)).toBeInTheDocument()
  })

  it('queues a set op under the given leaf when adding a value', async () => {
    const user = userEvent.setup()
    render(<ChipList values={[]} basePath={basePath} leaf="name-server" pathLabel={pathLabel} />)

    await user.type(screen.getByRole('textbox'), '1.1.1.1')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: [...basePath, 'name-server'], value: '1.1.1.1' })
  })

  it('queues a delete op under the given leaf when removing a value', async () => {
    const user = userEvent.setup()
    render(<ChipList values={['1.1.1.1']} basePath={basePath} leaf="name-server" pathLabel={pathLabel} />)

    await user.click(screen.getByLabelText('Remove 1.1.1.1'))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: [...basePath, 'name-server'], value: '1.1.1.1' })
  })

  it('disables the Add button until something is typed', () => {
    render(<ChipList values={[]} basePath={basePath} leaf="name-server" pathLabel={pathLabel} />)
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  // Regression test: queueAdd used to queue a duplicate `set` op for a
  // value already present in `values` with no feedback at all -
  // harmless at commit time (VyOS just no-ops a redundant set), but
  // silently misleading, unlike every sibling add/remove component
  // (KeyValuePairList.tsx, dhcp/NetworkCard.tsx) which already guards
  // against and surfaces this.
  it('disables Add and shows a message for a value that already exists', async () => {
    const user = userEvent.setup()
    render(<ChipList values={['1.1.1.1']} basePath={basePath} leaf="name-server" pathLabel={pathLabel} />)

    await user.type(screen.getByRole('textbox'), '1.1.1.1')

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByText(/already added/i)).toBeInTheDocument()
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  it('re-enables Add once the duplicate value is edited to something new', async () => {
    const user = userEvent.setup()
    render(<ChipList values={['1.1.1.1']} basePath={basePath} leaf="name-server" pathLabel={pathLabel} />)

    const input = screen.getByRole('textbox')
    await user.type(input, '1.1.1.1')
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()

    await user.type(input, '0')
    expect(screen.getByRole('button', { name: 'Add' })).not.toBeDisabled()
    expect(screen.queryByText(/already added/i)).not.toBeInTheDocument()
  })
})
