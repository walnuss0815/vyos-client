import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import StaticRoutesPage from './StaticRoutesPage'

const PROTOCOLS_STATIC = {
  route: {
    '192.0.2.0/24': {
      'next-hop': { '10.0.0.254': { distance: '10' } },
    },
    '10.0.0.0/8': {
      interface: { eth0: {} },
      blackhole: {},
    },
  },
  route6: {
    '2001:db8::/32': {
      'next-hop': { '2001:db8::1': {} },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: PROTOCOLS_STATIC })))
})

describe('StaticRoutesPage', () => {
  it('renders routes grouped by family with counts', async () => {
    renderWithProviders(<StaticRoutesPage />)

    expect(await screen.findByText('IPv4 (2)')).toBeInTheDocument()
    expect(screen.getByText('IPv6 (1)')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.0/24')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.0/8')).toBeInTheDocument()
    expect(screen.getByText('2001:db8::/32')).toBeInTheDocument()
  })

  it('shows a configured next-hop with its distance', async () => {
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('192.0.2.0/24')
    expect(screen.getByText('10.0.0.254')).toBeInTheDocument()
    expect(screen.getByText('distance 10')).toBeInTheDocument()
  })

  it('shows a configured interface route', async () => {
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('10.0.0.0/8')
    expect(screen.getByText('eth0')).toBeInTheDocument()
  })

  it('shows a configured blackhole with a Remove action', async () => {
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('10.0.0.0/8')
    expect(screen.getByText('Blackhole')).toBeInTheDocument()
  })

  it('queues deletion of an entire route destination', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('192.0.2.0/24')

    const deleteButtons = screen.getAllByRole('button', { name: /delete route/i })
    await user.click(deleteButtons[0])

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['protocols', 'static', 'route', '10.0.0.0/8'],
    })
  })

  it('queues removal of a single next-hop', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('10.0.0.254')

    // Multiple route cards each have their own next-hop/interface
    // entries, each with a Remove/Disable button - scope to the
    // specific entry's <li> to avoid ambiguity across cards.
    const nextHopRow = screen.getByText('10.0.0.254').closest('li')
    if (!nextHopRow) throw new Error('next-hop row not found')
    await user.click(within(nextHopRow).getByRole('button', { name: /^remove$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['protocols', 'static', 'route', '192.0.2.0/24', 'next-hop', '10.0.0.254'],
    })
  })

  it('queues a disable toggle for a next-hop', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('10.0.0.254')

    const nextHopRow = screen.getByText('10.0.0.254').closest('li')
    if (!nextHopRow) throw new Error('next-hop row not found')
    await user.click(within(nextHopRow).getByRole('button', { name: /^disable$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['protocols', 'static', 'route', '192.0.2.0/24', 'next-hop', '10.0.0.254', 'disable'],
    })
  })

  it('creates a new next-hop route with a distance', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('192.0.2.0/24')

    await user.click(screen.getByRole('button', { name: /new route/i }))
    await user.type(screen.getByPlaceholderText('192.0.2.0/24'), '203.0.113.0/24')
    await user.type(screen.getByPlaceholderText('10.0.0.254'), '203.0.113.1')
    await user.type(screen.getByPlaceholderText('1-255'), '5')
    await user.click(screen.getByRole('button', { name: /queue route creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: {
            op: 'set',
            path: ['protocols', 'static', 'route', '203.0.113.0/24', 'next-hop', '203.0.113.1'],
          },
        }),
        expect.objectContaining({
          op: {
            op: 'set',
            path: [
              'protocols',
              'static',
              'route',
              '203.0.113.0/24',
              'next-hop',
              '203.0.113.1',
              'distance',
            ],
            value: '5',
          },
        }),
      ]),
    )
  })

  it('creates a new reject route with distance and tag', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('192.0.2.0/24')

    await user.click(screen.getByRole('button', { name: /new route/i }))
    await user.type(screen.getByPlaceholderText('192.0.2.0/24'), '198.51.100.0/24')
    await user.selectOptions(screen.getByLabelText(/^via$/i), 'reject')
    await user.type(screen.getByPlaceholderText('1-255'), '200')
    await user.type(screen.getByLabelText(/tag/i), '100')
    await user.click(screen.getByRole('button', { name: /queue route creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual([
      { op: 'set', path: ['protocols', 'static', 'route', '198.51.100.0/24', 'reject'] },
      {
        op: 'set',
        path: ['protocols', 'static', 'route', '198.51.100.0/24', 'reject', 'distance'],
        value: '200',
      },
      {
        op: 'set',
        path: ['protocols', 'static', 'route', '198.51.100.0/24', 'reject', 'tag'],
        value: '100',
      },
    ])
  })

  it('creates a new ipv6 route', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('2001:db8::/32')

    await user.click(screen.getByRole('button', { name: /new route/i }))
    await user.selectOptions(screen.getByLabelText(/^family$/i), 'ipv6')
    await user.type(screen.getByPlaceholderText('2001:db8::/32'), '2001:db8:1::/48')
    await user.type(screen.getByPlaceholderText('2001:db8::1'), '2001:db8:1::1')
    await user.click(screen.getByRole('button', { name: /queue route creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['protocols', 'static', 'route6', '2001:db8:1::/48', 'next-hop', '2001:db8:1::1'],
    })
  })

  it('rejects an invalid destination CIDR', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('192.0.2.0/24')

    await user.click(screen.getByRole('button', { name: /new route/i }))
    await user.type(screen.getByPlaceholderText('192.0.2.0/24'), 'not-a-cidr')
    await user.type(screen.getByPlaceholderText('10.0.0.254'), '10.0.0.1')

    expect(screen.getByRole('button', { name: /queue route creation/i })).toBeDisabled()
  })

  it('rejects creating a route for a destination that already exists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('192.0.2.0/24')

    await user.click(screen.getByRole('button', { name: /new route/i }))
    await user.type(screen.getByPlaceholderText('192.0.2.0/24'), '192.0.2.0/24')
    await user.type(screen.getByPlaceholderText('10.0.0.254'), '10.0.0.1')

    expect(screen.getByText(/already configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue route creation/i })).toBeDisabled()
  })

  it('adds a dhcp-interface via the chip list', async () => {
    // A single-route fixture, deliberately not the shared
    // PROTOCOLS_STATIC one: with multiple route cards on the page,
    // each has its own "eth0"-placeholder dhcp-interface ChipList
    // input, and this test only needs to prove one thing (adding a
    // dhcp-interface queues the right op) without needing to
    // disambiguate between them.
    server.use(
      http.get('/api/config/tree', () =>
        HttpResponse.json({ data: { route: { '192.0.2.0/24': {} } } }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('192.0.2.0/24')

    await user.type(screen.getByPlaceholderText('eth0'), 'eth3')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['protocols', 'static', 'route', '192.0.2.0/24', 'dhcp-interface'],
      value: 'eth3',
    })
  })

  it('queues removal of an existing blackhole', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('10.0.0.0/8')

    const blackholeRow = screen.getByText('Blackhole').closest('div')
    if (!blackholeRow) throw new Error('blackhole row not found')
    await user.click(within(blackholeRow).getByRole('button', { name: /remove/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['protocols', 'static', 'route', '10.0.0.0/8', 'blackhole'],
    })
  })

  it('adds a reject to a route that has neither reject nor blackhole configured', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRoutesPage />)
    await screen.findByText('192.0.2.0/24')

    // Both 192.0.2.0/24 and 2001:db8::/32 lack a reject entry, so
    // there are two "+ Add reject" buttons - scope to this route's
    // own card.
    const card = screen.getByText('192.0.2.0/24').closest('.rounded-xl')
    if (!card) throw new Error('route card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add reject/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['protocols', 'static', 'route', '192.0.2.0/24', 'reject'],
    })
  })

  it('shows an error message when the routing config query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<StaticRoutesPage />)

    expect(await screen.findByText(/failed to load routing configuration/i)).toBeInTheDocument()
  })
})
