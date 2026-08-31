import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import SnmpPage from './SnmpPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('SnmpPage', () => {
  it('shows an enable prompt when service snmp is absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<SnmpPage />)

    expect(await screen.findByText(/snmp is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable snmp/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'snmp'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<SnmpPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders configured communities with their clients and networks', async () => {
    const snmp = {
      snmp: { community: { public: { authorization: 'ro', client: ['192.0.2.1'], network: ['192.0.2.0/24'] } } },
    }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: snmp })))
    renderWithProviders(<SnmpPage />)

    expect(await screen.findByText('public')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.1')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.0/24')).toBeInTheDocument()
  })

  it('adds a new community', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { snmp: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<SnmpPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('button', { name: /\+ add community/i }))
    await user.type(screen.getByPlaceholderText('public'), 'monitoring')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'snmp', 'community', 'monitoring'],
    })
  })

  it('saves settings changes', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { snmp: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<SnmpPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.type(screen.getByLabelText(/contact/i), 'admin@example.com')
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'snmp', 'contact'],
      value: 'admin@example.com',
    })
  })

  it('disables snmp entirely', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { snmp: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<SnmpPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('button', { name: /disable snmp entirely/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['service', 'snmp'] })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the settings form immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<SnmpPage />)

    await user.click(await screen.findByRole('button', { name: /enable snmp/i }))

    expect(await screen.findByRole('button', { name: /save settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable snmp entirely/i })).toBeInTheDocument()
  })
})

describe('SnmpPage - v3', () => {
  it('renders configured v3 groups, users, views, and trap-targets without leaking passwords', async () => {
    const snmp = {
      snmp: {
        v3: {
          group: { admins: { mode: 'rw' } },
          user: { alice: { auth: { 'plaintext-password': 'super-secret1' }, group: 'admins' } },
          view: { all: {} },
          'trap-target': { '192.0.2.3': { auth: { 'plaintext-password': 'super-secret2' } } },
        },
      },
    }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: snmp })))
    renderWithProviders(<SnmpPage />)

    await screen.findByText('Users (1)')
    expect(document.body.textContent).toContain('admins')
    expect(document.body.textContent).toContain('alice')
    expect(document.body.textContent).toContain('all')
    expect(document.body.textContent).toContain('192.0.2.3')
    expect(screen.getAllByText(/auth set/i).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('super-secret1')
    expect(document.body.textContent).not.toContain('super-secret2')
  })

  it('creates a new v3 group', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { snmp: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<SnmpPage />)
    await screen.findByRole('button', { name: /\+ add group/i })

    await user.click(screen.getByRole('button', { name: /\+ add group/i }))
    await user.type(screen.getByPlaceholderText('name'), 'admins')
    await user.click(screen.getByRole('button', { name: /^add group$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'snmp', 'v3', 'group', 'admins'],
    })
  })

  it('creates a new v3 user with a write-only auth password', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { snmp: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<SnmpPage />)
    await screen.findByRole('button', { name: /\+ add user/i })

    await user.click(screen.getByRole('button', { name: /\+ add user/i }))
    await user.type(screen.getByPlaceholderText('username'), 'alice')
    await user.type(screen.getByPlaceholderText(/auth password/i), 'super-secret1')
    await user.click(screen.getByRole('button', { name: /^add user$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'snmp', 'v3', 'user', 'alice', 'auth', 'plaintext-password'],
      value: 'super-secret1',
    })
  })

  it('creates a view and adds an OID to it', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { snmp: { v3: { view: { all: {} } } } } })))
    const user = userEvent.setup()
    renderWithProviders(<SnmpPage />)

    expect(await screen.findByText('all')).toBeInTheDocument()
    const viewRow = screen.getByText('all').closest('div.rounded')
    if (!viewRow) throw new Error('view row not found')
    await user.click(within(viewRow as HTMLElement).getByRole('button', { name: /oids/i }))
    await user.click(within(viewRow as HTMLElement).getByRole('button', { name: /\+ add oid/i }))
    await user.type(within(viewRow as HTMLElement).getByPlaceholderText('1.3.6.1'), '1.3.6.1')
    await user.click(within(viewRow as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'snmp', 'v3', 'view', 'all', 'oid', '1.3.6.1'],
    })
  })
})
