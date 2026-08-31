import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import HaproxyPage from './HaproxyPage'

const HAPROXY_CONFIG = {
  wan: {},
  haproxy: {
    service: {
      web: {
        backend: ['app-servers'],
        port: '443',
        mode: 'http',
      },
    },
    backend: {
      'app-servers': {
        balance: 'round-robin',
        mode: 'http',
        server: { app1: { address: '10.0.0.5', port: '8080' } },
      },
    },
    'global-parameters': { 'tls-version-min': '1.3' },
    timeout: { check: '5', connect: '10', client: '50', server: '50', tunnel: '300' },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  server.use(
    http.get('/api/config/tree', () => HttpResponse.json({ data: HAPROXY_CONFIG })),
    http.get('/api/load-balancing/haproxy/status', () => HttpResponse.json({ rows: [] })),
  )
})

describe('HaproxyPage', () => {
  it('shows an error message when the config fails to load', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<HaproxyPage />)
    expect(await screen.findByText(/failed to load load-balancing configuration/i)).toBeInTheDocument()
  })

  it('renders the services and backends lists', async () => {
    renderWithProviders(<HaproxyPage />)
    expect(await screen.findByText('web')).toBeInTheDocument()
    expect(screen.getByText(':443')).toBeInTheDocument()
    expect(screen.getByText('app-servers')).toBeInTheDocument()
    expect(screen.getByText(/app1 10\.0\.0\.5:8080/)).toBeInTheDocument()
  })

  it('adds a new backend', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HaproxyPage />)
    await screen.findByText('app-servers')

    await user.click(screen.getByRole('button', { name: '+ Add backend' }))
    await user.type(screen.getByPlaceholderText('app-servers'), 'db-servers')
    await user.click(screen.getByRole('button', { name: 'Add backend' }))

    const { changes } = usePendingChangesStore.getState()
    expect(
      changes.some((c) => c.op.op === 'set' && c.op.path.join(' ') === 'load-balancing haproxy backend db-servers'),
    ).toBe(true)
  })

  it('also queues an initial server when its optional fields are filled in', async () => {
    // VyOS refuses to commit any load-balancing haproxy config unless
    // every backend already has at least one server - and a brand new
    // backend doesn't exist server-side (so HaproxyServersSection
    // can't add one) until this form's own op has already been
    // committed - this optional field set lets a server be queued in
    // the same commit as the backend itself, avoiding that deadlock.
    const user = userEvent.setup()
    renderWithProviders(<HaproxyPage />)
    await screen.findByText('app-servers')

    await user.click(screen.getByRole('button', { name: '+ Add backend' }))
    await user.type(screen.getByPlaceholderText('app-servers'), 'db-servers')
    await user.type(screen.getByPlaceholderText('server name (e.g. app1)'), 'db1')
    await user.type(screen.getByPlaceholderText('10.0.0.5'), '198.51.100.5')
    await user.type(screen.getByPlaceholderText('8080'), '5432')
    await user.click(screen.getByRole('button', { name: 'Add backend' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'backend', 'db-servers', 'server', 'db1'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'backend', 'db-servers', 'server', 'db1', 'address'],
      value: '198.51.100.5',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'backend', 'db-servers', 'server', 'db1', 'port'],
      value: '5432',
    })
  })

  it('does not lose backend draft fields when the name is cleared and retyped mid-fill', async () => {
    // Regression test: the create panel's Name field used to live
    // outside HaproxyBackendFormPanel, gating the whole panel's
    // existence on it being non-empty - clearing it back to '' (even
    // briefly, e.g. to retype a typo) unmounted the panel and
    // discarded every other field already filled in.
    const user = userEvent.setup()
    renderWithProviders(<HaproxyPage />)
    await screen.findByText('app-servers')

    await user.click(screen.getByRole('button', { name: '+ Add backend' }))
    const nameInput = screen.getByPlaceholderText('app-servers')
    await user.type(nameInput, 'db-servers')
    await user.type(screen.getByPlaceholderText('server name (e.g. app1)'), 'db1')
    await user.clear(nameInput)
    await user.type(nameInput, 'db-servers')
    await user.click(screen.getByRole('button', { name: 'Add backend' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'backend', 'db-servers', 'server', 'db1'] })
  })

  it('also queues a first routing rule for a new backend when its optional fields are filled in', async () => {
    // Regression test: a backend's routing rules used to only be
    // addable AFTER the backend already existed -
    // HaproxyBackendRulesSection only ever operates on an
    // already-fetched backend.
    const user = userEvent.setup()
    renderWithProviders(<HaproxyPage />)
    await screen.findByText('app-servers')

    await user.click(screen.getByRole('button', { name: '+ Add backend' }))
    await user.type(screen.getByPlaceholderText('app-servers'), 'db-servers')
    await user.type(screen.getByPlaceholderText('example.com'), 'db.example.com')
    await user.type(screen.getByPlaceholderText('route to server name'), 'db1')
    await user.click(screen.getByRole('button', { name: 'Add backend' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'backend', 'db-servers', 'rule', '1'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'backend', 'db-servers', 'rule', '1', 'domain-name'],
      value: 'db.example.com',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'backend', 'db-servers', 'rule', '1', 'set', 'server'],
      value: 'db1',
    })
  })

  it('adds a new service with a first listen address and a first rule', async () => {
    // Regression test: a service's listen addresses and routing rules
    // used to only be addable AFTER the service already existed -
    // HaproxyListenAddressesSection/HaproxyServiceRulesSection only
    // ever operate on an already-fetched service.
    const user = userEvent.setup()
    renderWithProviders(<HaproxyPage />)
    await screen.findByText('web')

    await user.click(screen.getByRole('button', { name: '+ Add service' }))
    await user.type(screen.getByPlaceholderText('web'), 'api')
    await user.type(screen.getByPlaceholderText('0.0.0.0 or ::'), '203.0.113.10')
    await user.type(screen.getByPlaceholderText('example.com'), 'api.example.com')
    await user.type(screen.getByPlaceholderText('backend name'), 'app-servers')
    await user.click(screen.getByRole('button', { name: 'Add service' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'service', 'api'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'service', 'api', 'listen-address', '203.0.113.10'],
    })
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'haproxy', 'service', 'api', 'rule', '1'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'service', 'api', 'rule', '1', 'domain-name'],
      value: 'api.example.com',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'service', 'api', 'rule', '1', 'set', 'backend'],
      value: 'app-servers',
    })
  })

  it('does not lose service draft fields when the name is cleared and retyped mid-fill', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HaproxyPage />)
    await screen.findByText('web')

    await user.click(screen.getByRole('button', { name: '+ Add service' }))
    const nameInput = screen.getByPlaceholderText('web')
    await user.type(nameInput, 'api')
    await user.type(screen.getByPlaceholderText('0.0.0.0 or ::'), '203.0.113.10')
    await user.clear(nameInput)
    await user.type(nameInput, 'api')
    await user.click(screen.getByRole('button', { name: 'Add service' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'haproxy', 'service', 'api', 'listen-address', '203.0.113.10'],
    })
  })

  it('deletes a service', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HaproxyPage />)
    await screen.findByText('web')

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(deleteButtons[0])

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toContainEqual(
      expect.objectContaining({ op: { op: 'delete', path: ['load-balancing', 'haproxy', 'service', 'web'] } }),
    )
  })

  it('saves a global settings change', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HaproxyPage />)
    await screen.findByText('Global settings')

    const vrfInput = screen.getByLabelText(/vrf/i)
    await user.type(vrfInput, 'RED')
    await user.click(screen.getByRole('button', { name: 'Save global settings' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toContainEqual(
      expect.objectContaining({ op: { op: 'set', path: ['load-balancing', 'haproxy', 'vrf'], value: 'RED' } }),
    )
  })

  it('shows the live HAProxy status panel', async () => {
    server.use(
      http.get('/api/load-balancing/haproxy/status', () =>
        HttpResponse.json({
          rows: [{ proxyName: 'web', role: 'FRONTEND', status: 'OPEN', reqRate: '0', respTime: '', lastChange: '1d2h' }],
        }),
      ),
    )
    renderWithProviders(<HaproxyPage />)
    expect(await screen.findByText('OPEN')).toBeInTheDocument()
  })
})
