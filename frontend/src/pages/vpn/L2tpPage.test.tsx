import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import L2tpPage from './L2tpPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('L2tpPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)

    expect(await screen.findByText(/l2tp is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable l2tp/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['vpn', 'l2tp'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<L2tpPage />)
    expect(await screen.findByText(/failed to load vpn configuration/i)).toBeInTheDocument()
  })

  it('saves settings including L2TP-only fields without leaking secrets', async () => {
    const vpn = { l2tp: { 'remote-access': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)
    await screen.findAllByRole('button', { name: /save settings/i })

    await user.type(screen.getByLabelText(/outside address/i), '203.0.113.1')
    const lnsSecretInput = screen.getByLabelText(/lns shared secret/i)
    await user.type(lnsSecretInput, 'super-secret-lns')
    await user.click(screen.getAllByRole('button', { name: /save settings/i })[0])

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'outside-address'],
      value: '203.0.113.1',
    })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'lns', 'shared-secret'],
      value: 'super-secret-lns',
    })
    expect(JSON.stringify(changes)).not.toContain('secret-lns-leaked')
  })

  it('adds a local user', async () => {
    const vpn = { l2tp: { 'remote-access': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)
    await screen.findByRole('button', { name: /\+ add user/i })

    const addUserButton = screen.getByRole('button', { name: /\+ add user/i })
    const usersSection = addUserButton.closest('div.border-t')
    if (!usersSection) throw new Error('local users section not found')
    await user.click(addUserButton)
    await user.type(screen.getByPlaceholderText('username'), 'alice')
    await user.type(screen.getByPlaceholderText('password'), 'super-secret')
    await user.click(within(usersSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'local-users', 'username', 'alice'],
    })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'authentication', 'local-users', 'username', 'alice', 'password'],
      value: 'super-secret',
    })
  })

  it('adds a client IPv4 pool', async () => {
    const vpn = { l2tp: { 'remote-access': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)
    await screen.findByRole('button', { name: /\+ add pool/i })

    await user.click(screen.getByRole('button', { name: /\+ add pool/i }))
    await user.type(screen.getByPlaceholderText('pool name'), 'POOL-A')
    await user.type(screen.getByPlaceholderText(/192.0.2.0\/24/i), '192.0.2.0/24')
    await user.click(screen.getByRole('button', { name: /^add pool$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'client-ip-pool', 'POOL-A', 'range'],
      value: '192.0.2.0/24',
    })
  })

  it('creates a new client IPv6 pool', async () => {
    const vpn = { l2tp: { 'remote-access': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)
    await screen.findByRole('button', { name: /\+ new pool/i })

    await user.click(screen.getByRole('button', { name: /\+ new pool/i }))
    await user.type(screen.getByPlaceholderText('pool name'), 'POOL6-A')
    await user.click(screen.getByRole('button', { name: /^create$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'client-ipv6-pool', 'POOL6-A'],
    })
  })

  it('adds a prefix to an existing client IPv6 pool', async () => {
    const vpn = { l2tp: { 'remote-access': { 'client-ipv6-pool': { 'POOL6-A': {} } } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)

    expect(await screen.findByText('POOL6-A')).toBeInTheDocument()
    const card = screen.getByText('POOL6-A').closest('div.rounded-xl')
    if (!card) throw new Error('pool card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /\+ add prefix/i }))
    await user.type(within(card as HTMLElement).getByPlaceholderText(/2001:db8::\/64/i), '2001:db8::/64')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^add prefix$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'l2tp', 'remote-access', 'client-ipv6-pool', 'POOL6-A', 'prefix', '2001:db8::/64'],
    })
  })

  it('disables L2TP entirely', async () => {
    const vpn = { l2tp: { 'remote-access': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)

    await user.click(await screen.findByRole('button', { name: /disable l2tp entirely/i }))
    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({ op: 'delete', path: ['vpn', 'l2tp'] })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the settings form immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)

    await user.click(await screen.findByRole('button', { name: /enable l2tp/i }))

    expect(await screen.findByLabelText(/outside address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable l2tp entirely/i })).toBeInTheDocument()
  })

  it('reverts to the enable prompt immediately after clicking Disable, without committing', async () => {
    const vpn = { l2tp: { 'remote-access': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)
    await screen.findByRole('button', { name: /disable l2tp entirely/i })

    await user.click(screen.getByRole('button', { name: /disable l2tp entirely/i }))

    expect(await screen.findByText(/l2tp is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enable l2tp/i })).toBeInTheDocument()
  })

  // Regression test: see store/pendingChanges.ts's latestPendingOp.
  it('can be re-enabled after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<L2tpPage />)

    await user.click(await screen.findByRole('button', { name: /enable l2tp/i }))
    await user.click(await screen.findByRole('button', { name: /disable l2tp entirely/i }))
    await screen.findByRole('button', { name: /enable l2tp/i })
    await user.click(screen.getByRole('button', { name: /enable l2tp/i }))

    expect(await screen.findByLabelText(/outside address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable l2tp entirely/i })).toBeInTheDocument()
  })
})
