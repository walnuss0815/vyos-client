import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import BridgePage from './BridgePage'

const INTERFACES_CONFIG = {
  bridge: {
    br0: {
      stp: null,
      member: {
        interface: {
          eth4: { priority: '10', cost: '100' },
          eth5: {},
        },
      },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(
    http.get('/api/interfaces', () => HttpResponse.json({ interfaces: [] })),
    http.get('/api/config/tree', ({ request }) => {
      const path = new URL(request.url).searchParams.get('path')
      if (path === 'vrf') return HttpResponse.json({ data: { name: { red: { table: '100' } } } })
      return HttpResponse.json({ data: INTERFACES_CONFIG })
    }),
  )
})

describe('BridgePage', () => {
  it('renders existing bridges with STP state and members', async () => {
    renderWithProviders(<BridgePage />)

    expect(await screen.findByText('br0')).toBeInTheDocument()
    expect(screen.getByText('on')).toBeInTheDocument() // STP
    expect(screen.getByText('eth4')).toBeInTheDocument()
    expect(screen.getByText('eth5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10')).toBeInTheDocument() // eth4's priority
    expect(screen.getByDisplayValue('100')).toBeInTheDocument() // eth4's cost
  })

  it('shows an empty-state message when there are no bridges', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    renderWithProviders(<BridgePage />)
    expect(await screen.findByText(/no bridges configured yet/i)).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<BridgePage />)
    expect(await screen.findByText(/failed to load interface configuration/i)).toBeInTheDocument()
  })

  it('creates a new bridge with a name and first member', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BridgePage />)
    await screen.findByText('br0')

    await user.click(screen.getByRole('button', { name: /new bridge/i }))
    await user.type(screen.getByPlaceholderText('br0'), 'br1')
    await user.type(screen.getByPlaceholderText('eth1'), 'eth6')
    await user.click(screen.getByRole('button', { name: /queue bridge creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['interfaces', 'bridge', 'br1', 'member', 'interface', 'eth6'],
    })
  })

  it('rejects creating a bridge with a name that already exists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BridgePage />)
    await screen.findByText('br0')

    await user.click(screen.getByRole('button', { name: /new bridge/i }))
    await user.type(screen.getByPlaceholderText('br0'), 'br0')
    await user.type(screen.getByPlaceholderText('eth1'), 'eth6')

    expect(screen.getByText(/bridge br0 already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue bridge creation/i })).toBeDisabled()
  })

  it('queues bridge deletion', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BridgePage />)
    await screen.findByText('br0')

    await user.click(screen.getByRole('button', { name: /delete bridge/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['interfaces', 'bridge', 'br0'] })
  })

  it('queues a member add (no value) and a member remove', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BridgePage />)
    await screen.findByText('br0')

    await user.type(screen.getByPlaceholderText('eth2'), 'eth7')
    await user.click(screen.getByRole('button', { name: /add member/i }))
    await user.click(screen.getByLabelText('Remove member eth5 from bridge br0'))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      expect.objectContaining({
        op: { op: 'set', path: ['interfaces', 'bridge', 'br0', 'member', 'interface', 'eth7'] },
      }),
      expect.objectContaining({
        op: { op: 'delete', path: ['interfaces', 'bridge', 'br0', 'member', 'interface', 'eth5'] },
      }),
    ])
  })

  it('queues a priority change for a member when its field loses focus', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BridgePage />)
    await screen.findByText('br0')

    const priorityInput = screen.getByDisplayValue('10')
    await user.clear(priorityInput)
    await user.type(priorityInput, '20')
    await user.tab()

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['interfaces', 'bridge', 'br0', 'member', 'interface', 'eth4', 'priority'],
      value: '20',
    })
  })

  it('queues stp/vlan-aware/description changes when editing a bridge', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BridgePage />)
    await screen.findByText('br0')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('checkbox', { name: /vlan-aware/i }))
    await user.click(screen.getByRole('button', { name: /queue changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      {
        id: expect.any(String),
        op: { op: 'set', path: ['interfaces', 'bridge', 'br0', 'enable-vlan'] },
        label: expect.any(String),
      },
    ])
  })

  it('offers the VRF picker populated from configured VRFs', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BridgePage />)
    await screen.findByText('br0')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('option', { name: 'red' })).toBeInTheDocument()
  })
})
