import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import NetworksPage from './NetworksPage'

const CONTAINER = {
  network: {
    NET01: {
      description: 'Container LAN',
      type: { bridge: {} },
      gateway: ['192.0.2.1'],
      prefix: ['192.0.2.0/24'],
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: CONTAINER })))
})

describe('NetworksPage', () => {
  it('renders networks with their description, type, gateways, and prefixes', async () => {
    renderWithProviders(<NetworksPage />)

    expect(await screen.findByText('NET01')).toBeInTheDocument()
    expect(screen.getByText('Container LAN')).toBeInTheDocument()
    expect(screen.getByText('bridge')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.1')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.0/24')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<NetworksPage />)
    expect(await screen.findByText(/failed to load container configuration/i)).toBeInTheDocument()
  })

  it('creates a new network', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NetworksPage />)
    await screen.findByText('NET01')

    await user.click(screen.getByRole('button', { name: /\+ new network/i }))
    await user.type(screen.getByLabelText(/^name/i), 'NET02')
    await user.selectOptions(screen.getByLabelText(/^type/i), 'bridge')
    await user.click(screen.getByRole('button', { name: /queue network creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({ op: 'set', path: ['container', 'network', 'NET02', 'type', 'bridge'] })
  })

  it('also queues an initial prefix when the optional field is filled in', async () => {
    // VyOS refuses to commit a container network with no prefix at
    // all, and a brand new network doesn't exist server-side (so
    // ChipList can't add one) until this form's own op has already
    // been committed - this optional field lets a prefix be queued in
    // the same commit as the network itself, avoiding that deadlock.
    const user = userEvent.setup()
    renderWithProviders(<NetworksPage />)
    await screen.findByText('NET01')

    await user.click(screen.getByRole('button', { name: /\+ new network/i }))
    await user.type(screen.getByLabelText(/^name/i), 'NET02')
    await user.type(screen.getByLabelText(/initial prefix/i), '172.20.0.0/24')
    await user.click(screen.getByRole('button', { name: /queue network creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['container', 'network', 'NET02', 'prefix'],
      value: '172.20.0.0/24',
    })
  })

  it('rejects a network name longer than 11 characters', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NetworksPage />)
    await screen.findByText('NET01')

    await user.click(screen.getByRole('button', { name: /\+ new network/i }))
    await user.type(screen.getByLabelText(/^name/i), 'way-too-long-name')

    expect(screen.getByRole('button', { name: /queue network creation/i })).toBeDisabled()
    expect(screen.getByText(/cannot be longer than 11 characters/i)).toBeInTheDocument()
  })

  it('deletes a network', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NetworksPage />)
    await screen.findByText('NET01')

    const card = screen.getByText('NET01').closest('div.rounded-xl')
    if (!card) throw new Error('network card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['container', 'network', 'NET01'] })
  })
})
