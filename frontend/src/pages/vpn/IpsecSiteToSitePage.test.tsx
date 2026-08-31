import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import IpsecSiteToSitePage from './IpsecSiteToSitePage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('IpsecSiteToSitePage', () => {
  it('renders empty state when vpn is absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    renderWithProviders(<IpsecSiteToSitePage />)
    expect(await screen.findByText(/no site-to-site peers configured yet/i)).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<IpsecSiteToSitePage />)
    expect(await screen.findByText(/failed to load vpn configuration/i)).toBeInTheDocument()
  })

  it('creates a new peer with a remote address', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecSiteToSitePage />)
    await screen.findByRole('button', { name: /\+ new peer/i })

    await user.click(screen.getByRole('button', { name: /\+ new peer/i }))
    await user.type(screen.getByLabelText(/^name/i), 'peer-1')
    await user.type(screen.getByLabelText(/remote address/i), '203.0.113.1')
    await user.click(screen.getByRole('button', { name: /queue creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1'],
    })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'remote-address'],
      value: '203.0.113.1',
    })
  })

  // Regression test: a peer's first tunnel used to only be addable
  // AFTER the peer already existed - TunnelsSection only ever
  // operates on an already-fetched peer.
  it('creates a new peer with a first tunnel, all in one commit', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecSiteToSitePage />)
    await screen.findByRole('button', { name: /\+ new peer/i })

    await user.click(screen.getByRole('button', { name: /\+ new peer/i }))
    await user.type(screen.getByLabelText(/^name/i), 'peer-1')
    await user.type(screen.getByLabelText(/tunnel #/i), '0')
    await user.type(screen.getByLabelText(/^local prefix/i), '192.168.1.0/24')
    await user.type(screen.getByLabelText(/^remote prefix/i), '10.0.0.0/24')
    await user.click(screen.getByRole('button', { name: /queue creation/i }))

    const ops = usePendingChangesStore.getState().changes.map((c) => c.op)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'tunnel', '0'],
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'tunnel', '0', 'local', 'prefix'],
      value: '192.168.1.0/24',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'tunnel', '0', 'remote', 'prefix'],
      value: '10.0.0.0/24',
    })
  })

  it('strips non-numeric characters from the first-tunnel and post-create tunnel # fields', async () => {
    // Regression test: VyOS tunnel IDs are always numeric, but neither
    // field constrained input to digits - a stray character would
    // only fail at commit time instead of being caught inline.
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecSiteToSitePage />)
    await screen.findByRole('button', { name: /\+ new peer/i })

    await user.click(screen.getByRole('button', { name: /\+ new peer/i }))
    await user.type(screen.getByLabelText(/^name/i), 'peer-1')
    await user.type(screen.getByLabelText(/tunnel #/i), 'a1b2')
    expect(screen.getByLabelText(/tunnel #/i)).toHaveValue('12')
  })

  it('shows peer details and adds a tunnel', async () => {
    const vpn = { ipsec: { 'site-to-site': { peer: { 'peer-1': { 'remote-address': ['203.0.113.1'] } } } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecSiteToSitePage />)

    expect(await screen.findByText('peer-1')).toBeInTheDocument()
    const card = screen.getByText('peer-1').closest('div.rounded-xl')
    if (!card) throw new Error('peer card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /details/i }))
    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add tunnel/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText('tunnel #'), '0')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add tunnel$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1', 'tunnel', '0'],
    })
  })

  it('strips non-numeric characters from the post-create "+ Add tunnel" field', async () => {
    const vpn = { ipsec: { 'site-to-site': { peer: { 'peer-1': { 'remote-address': ['203.0.113.1'] } } } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecSiteToSitePage />)

    expect(await screen.findByText('peer-1')).toBeInTheDocument()
    const card = screen.getByText('peer-1').closest('div.rounded-xl')
    if (!card) throw new Error('peer card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /details/i }))
    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add tunnel/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText('tunnel #'), 'a1b2')
    expect(within(card as HTMLElement).getByPlaceholderText('tunnel #')).toHaveValue('12')
  })

  it('deletes a peer', async () => {
    const vpn = { ipsec: { 'site-to-site': { peer: { 'peer-1': {} } } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecSiteToSitePage />)

    expect(await screen.findByText('peer-1')).toBeInTheDocument()
    const card = screen.getByText('peer-1').closest('div.rounded-xl')
    if (!card) throw new Error('peer card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'delete',
      path: ['vpn', 'ipsec', 'site-to-site', 'peer', 'peer-1'],
    })
  })
})
