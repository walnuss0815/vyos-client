import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import BGPPage from './BGPPage'

const PROTOCOLS_BGP = {
  'system-as': '64512',
  parameters: { 'router-id': '192.0.2.1' },
  neighbor: {
    '192.0.2.2': { 'remote-as': '64513', description: 'Upstream provider' },
  },
  'peer-group': {
    UPSTREAM: { 'remote-as': 'external' },
  },
  'address-family': {
    'ipv4-unicast': {
      network: { '198.51.100.0/24': {} },
      redistribute: { static: { metric: '100' } },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: PROTOCOLS_BGP })))
})

describe('BGPPage', () => {
  it('renders global settings, neighbors, peer-groups, networks and redistribution', async () => {
    renderWithProviders(<BGPPage />)

    expect(await screen.findByDisplayValue('64512')).toBeInTheDocument()
    expect(screen.getByDisplayValue('192.0.2.1')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.2')).toBeInTheDocument()
    expect(screen.getByText('UPSTREAM')).toBeInTheDocument()
    expect(screen.getByText('198.51.100.0/24')).toBeInTheDocument()
    const redistributionList = screen.getByText('Redistribution').closest('div.rounded-xl')?.querySelector('ul')
    if (!redistributionList) throw new Error('redistribution list not found')
    expect(within(redistributionList).getByText('static')).toBeInTheDocument()
    expect(within(redistributionList).getByText('metric 100')).toBeInTheDocument()
  })

  it('shows an error message when the BGP config query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<BGPPage />)
    expect(await screen.findByText(/failed to load bgp configuration/i)).toBeInTheDocument()
  })

  it('saves a changed router-id from the global settings form', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BGPPage />)
    const routerIdInput = await screen.findByDisplayValue('192.0.2.1')

    await user.clear(routerIdInput)
    await user.type(routerIdInput, '192.0.2.9')
    await user.click(screen.getByRole('button', { name: /save global settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'parameters', 'router-id'],
      value: '192.0.2.9',
    })
  })

  it('creates a new neighbor via the "+ New neighbor" form', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BGPPage />)
    await screen.findByText('192.0.2.2')

    await user.click(screen.getByRole('button', { name: /\+ new neighbor/i }))
    await user.type(screen.getByLabelText(/address \/ interface/i), '203.0.113.5')
    await user.type(screen.getByLabelText(/remote as/i), '64520')
    await user.click(screen.getByRole('button', { name: /queue neighbor creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'neighbor', '203.0.113.5', 'remote-as'],
      value: '64520',
    })
  })

  it('deletes a neighbor', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BGPPage />)
    await screen.findByText('192.0.2.2')

    const neighborRow = screen.getByText('192.0.2.2').closest('div.flex.items-center.justify-between')
    if (!neighborRow) throw new Error('neighbor row not found')
    await user.click(within(neighborRow as HTMLElement).getByRole('button', { name: /delete/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['protocols', 'bgp', 'neighbor', '192.0.2.2'],
    })
  })

  it('offers the existing peer-group in a neighbor\'s peer-group assignment select', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BGPPage />)
    await screen.findByText('192.0.2.2')

    await user.click(screen.getByRole('button', { name: /\+ new neighbor/i }))
    expect(within(screen.getByLabelText(/peer-group/i)).getByRole('option', { name: 'UPSTREAM' })).toBeInTheDocument()
  })

  it('adds a network advertisement', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BGPPage />)
    await screen.findByText('198.51.100.0/24')

    await user.type(screen.getByPlaceholderText('198.51.100.0/24'), '203.0.113.0/24')
    const networksSection = screen.getByText('Network advertisement').closest('div.rounded-xl')
    if (!networksSection) throw new Error('networks section not found')
    await user.click(within(networksSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['protocols', 'bgp', 'address-family', 'ipv4-unicast', 'network', '203.0.113.0/24'],
    })
  })

  it('removes an existing network advertisement', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BGPPage />)
    await screen.findByText('198.51.100.0/24')

    const row = screen.getByText('198.51.100.0/24').closest('li')
    if (!row) throw new Error('network row not found')
    await user.click(within(row).getByRole('button', { name: /remove/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['protocols', 'bgp', 'address-family', 'ipv4-unicast', 'network', '198.51.100.0/24'],
    })
  })

  it('adds a redistribution source with a metric', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BGPPage />)
    await screen.findByText('198.51.100.0/24')

    await user.selectOptions(screen.getByLabelText(/redistribution source/i), 'connected')
    await user.type(screen.getByPlaceholderText(/metric/i), '50')
    const redistributionSection = screen.getByText('Redistribution').closest('div.rounded-xl')
    if (!redistributionSection) throw new Error('redistribution section not found')
    await user.click(within(redistributionSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual([
      {
        op: 'set',
        path: ['protocols', 'bgp', 'address-family', 'ipv4-unicast', 'redistribute', 'connected'],
      },
      {
        op: 'set',
        path: [
          'protocols',
          'bgp',
          'address-family',
          'ipv4-unicast',
          'redistribute',
          'connected',
          'metric',
        ],
        value: '50',
      },
    ])
  })
})
