import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import type { BGPPeer } from '../../lib/bgpTypes'
import BGPPeerForm from './BGPPeerForm'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

function emptyPeer(overrides: Partial<BGPPeer> = {}): BGPPeer {
  return {
    identifier: '192.0.2.2',
    kind: 'neighbor',
    hasPassword: false,
    shutdown: false,
    passive: false,
    ipv4Unicast: { nexthopSelf: false, removePrivateAs: false, softReconfigurationInbound: false },
    ipv6Unicast: { nexthopSelf: false, removePrivateAs: false, softReconfigurationInbound: false },
    ...overrides,
  }
}

describe('BGPPeerForm - creating a neighbor', () => {
  it('disables submit until an identifier and remote-as are set', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <BGPPeerForm kind="neighbor" existingIdentifiers={[]} peerGroupNames={[]} onDone={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /queue neighbor creation/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/address \/ interface/i), '192.0.2.2')
    expect(screen.getByRole('button', { name: /queue neighbor creation/i })).toBeDisabled()

    await user.type(screen.getByLabelText(/remote as/i), '64513')
    expect(screen.getByRole('button', { name: /queue neighbor creation/i })).toBeEnabled()
  })

  it('shows a duplicate-identifier error', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <BGPPeerForm
        kind="neighbor"
        existingIdentifiers={['192.0.2.2']}
        peerGroupNames={[]}
        onDone={() => {}}
      />,
    )
    await user.type(screen.getByLabelText(/address \/ interface/i), '192.0.2.2')
    expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue neighbor creation/i })).toBeDisabled()
  })

  it('queues remote-as and description ops on submit', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <BGPPeerForm kind="neighbor" existingIdentifiers={[]} peerGroupNames={[]} onDone={() => {}} />,
    )
    await user.type(screen.getByLabelText(/address \/ interface/i), '192.0.2.2')
    await user.type(screen.getByLabelText(/remote as/i), '64513')
    await user.type(screen.getByLabelText(/description/i), 'Upstream')
    await user.click(screen.getByRole('button', { name: /queue neighbor creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'remote-as'], value: '64513' },
        {
          op: 'set',
          path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'description'],
          value: 'Upstream',
        },
      ]),
    )
  })

  it('offers configured peer-groups in the assignment select, only for neighbors', async () => {
    renderWithProviders(
      <BGPPeerForm
        kind="neighbor"
        existingIdentifiers={[]}
        peerGroupNames={['UPSTREAM']}
        onDone={() => {}}
      />,
    )
    expect(screen.getByLabelText(/peer-group/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'UPSTREAM' })).toBeInTheDocument()
  })

  it('does not show a peer-group assignment field when creating a peer-group', () => {
    renderWithProviders(
      <BGPPeerForm kind="peer-group" existingIdentifiers={[]} peerGroupNames={[]} onDone={() => {}} />,
    )
    expect(screen.queryByLabelText(/^peer-group$/i)).not.toBeInTheDocument()
  })

  it('switches to the IPv4/IPv6 tabs and queues address-family ops', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <BGPPeerForm kind="neighbor" existingIdentifiers={[]} peerGroupNames={[]} onDone={() => {}} />,
    )
    await user.type(screen.getByLabelText(/address \/ interface/i), '192.0.2.2')
    await user.type(screen.getByLabelText(/remote as/i), '64513')

    await user.click(screen.getByRole('button', { name: 'ipv4' }))
    await user.click(screen.getByLabelText(/next-hop self/i))
    await user.click(screen.getByRole('button', { name: /queue neighbor creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'address-family', 'ipv4-unicast', 'nexthop-self'],
    })
  })

  it('queues a password set when typed, using a masked input type', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <BGPPeerForm kind="neighbor" existingIdentifiers={[]} peerGroupNames={[]} onDone={() => {}} />,
    )
    await user.type(screen.getByLabelText(/address \/ interface/i), '192.0.2.2')
    await user.type(screen.getByLabelText(/remote as/i), '64513')

    const passwordInput = screen.getByLabelText(/^password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')
    await user.type(passwordInput, 'secret123')
    await user.click(screen.getByRole('button', { name: /queue neighbor creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'password'],
      value: 'secret123',
    })
  })
})

describe('BGPPeerForm - editing an existing peer', () => {
  it('pre-fills fields from the existing peer and only queues the changed one', async () => {
    const user = userEvent.setup()
    const peer = emptyPeer({ remoteAs: '64513', description: 'Old description' })
    renderWithProviders(
      <BGPPeerForm kind="neighbor" peer={peer} existingIdentifiers={['192.0.2.2']} peerGroupNames={[]} onDone={() => {}} />,
    )
    expect(screen.getByDisplayValue('64513')).toBeInTheDocument()

    const descriptionInput = screen.getByLabelText(/description/i)
    await user.clear(descriptionInput)
    await user.type(descriptionInput, 'New description')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual([
      {
        op: 'set',
        path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'description'],
        value: 'New description',
      },
    ])
  })

  it('disables the identifier field while editing', () => {
    const peer = emptyPeer()
    renderWithProviders(
      <BGPPeerForm kind="neighbor" peer={peer} existingIdentifiers={[]} peerGroupNames={[]} onDone={() => {}} />,
    )
    expect(screen.getByLabelText(/address \/ interface/i)).toBeDisabled()
  })

  it('shows a "Remove password" action only when a password is currently configured', () => {
    const withPassword = emptyPeer({ hasPassword: true, remoteAs: '64513' })
    const { unmount } = renderWithProviders(
      <BGPPeerForm
        kind="neighbor"
        peer={withPassword}
        existingIdentifiers={[]}
        peerGroupNames={[]}
        onDone={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /remove password/i })).toBeInTheDocument()
    unmount()

    const withoutPassword = emptyPeer({ hasPassword: false, remoteAs: '64513' })
    renderWithProviders(
      <BGPPeerForm
        kind="neighbor"
        peer={withoutPassword}
        existingIdentifiers={[]}
        peerGroupNames={[]}
        onDone={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /remove password/i })).not.toBeInTheDocument()
  })

  it('queues a password delete op when "Remove password" is clicked', async () => {
    const user = userEvent.setup()
    const peer = emptyPeer({ hasPassword: true, remoteAs: '64513' })
    renderWithProviders(
      <BGPPeerForm kind="neighbor" peer={peer} existingIdentifiers={[]} peerGroupNames={[]} onDone={() => {}} />,
    )
    await user.click(screen.getByRole('button', { name: /remove password/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['protocols', 'bgp', 'neighbor', '192.0.2.2', 'password'],
    })
  })

  it('builds peer-group paths for a peer-group entity', async () => {
    const user = userEvent.setup()
    const peerGroup = emptyPeer({ identifier: 'UPSTREAM', kind: 'peer-group', remoteAs: 'external' })
    renderWithProviders(
      <BGPPeerForm
        kind="peer-group"
        peer={peerGroup}
        existingIdentifiers={[]}
        peerGroupNames={[]}
        onDone={() => {}}
      />,
    )
    await user.click(screen.getByLabelText(/shut down/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'peer-group', 'UPSTREAM', 'shutdown'],
    })
  })
})
