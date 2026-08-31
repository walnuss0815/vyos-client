import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import RouterAdvertPage from './RouterAdvertPage'

const SERVICE = {
  'router-advert': {
    interface: {
      eth0: {
        'hop-limit': '32',
        prefix: { '2001:db8::/64': { 'valid-lifetime': '2592000' } },
      },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: SERVICE })))
})

describe('RouterAdvertPage', () => {
  it('renders interfaces with RA enabled', async () => {
    renderWithProviders(<RouterAdvertPage />)
    expect(await screen.findByText('eth0')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<RouterAdvertPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('enables RA on a new interface', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouterAdvertPage />)
    await screen.findByText('eth0')

    await user.click(screen.getByRole('button', { name: /\+ enable on interface/i }))
    await user.type(screen.getByLabelText(/^interface/i), 'eth1')
    await user.click(screen.getByRole('button', { name: /^enable$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'router-advert', 'interface', 'eth1'],
    })
  })

  it('also queues a first prefix and route when enabling RA on a new interface with optional fields filled in', async () => {
    // Regression test: an interface's prefixes and routes used to
    // only be configurable AFTER RA was already enabled on it -
    // PrefixesSection/RoutesSection only ever operate on an
    // already-fetched interface.
    const user = userEvent.setup()
    renderWithProviders(<RouterAdvertPage />)
    await screen.findByText('eth0')

    await user.click(screen.getByRole('button', { name: /\+ enable on interface/i }))
    await user.type(screen.getByLabelText(/^interface/i), 'eth1')
    await user.type(screen.getByLabelText(/first prefix/i), '2001:db8:3::/64')
    await user.type(screen.getByLabelText(/first route/i), '2001:db8:4::/64')
    await user.click(screen.getByRole('button', { name: /^enable$/i }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['service', 'router-advert', 'interface', 'eth1', 'prefix', '2001:db8:3::/64'],
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['service', 'router-advert', 'interface', 'eth1', 'route', '2001:db8:4::/64'],
    })
  })

  it('shows details including advertised prefixes and lets a route be added', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouterAdvertPage />)
    await screen.findByText('eth0')

    const card = screen.getByText('eth0').closest('div.rounded-xl')
    if (!card) throw new Error('interface card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /details/i }))

    expect(within(card as HTMLElement).getByText('2001:db8::/64')).toBeInTheDocument()

    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add route/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText('2001:db8:1::/64'), '2001:db8:2::/64')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add route$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'router-advert', 'interface', 'eth0', 'route', '2001:db8:2::/64'],
    })
  })

  it('deletes an interface', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouterAdvertPage />)
    await screen.findByText('eth0')

    const card = screen.getByText('eth0').closest('div.rounded-xl')
    if (!card) throw new Error('interface card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'delete',
      path: ['service', 'router-advert', 'interface', 'eth0'],
    })
  })
})
