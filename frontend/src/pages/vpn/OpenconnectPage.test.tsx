import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import OpenconnectPage from './OpenconnectPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('OpenconnectPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<OpenconnectPage />)

    expect(await screen.findByText(/openconnect is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable openconnect/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['vpn', 'openconnect'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<OpenconnectPage />)
    expect(await screen.findByText(/failed to load vpn configuration/i)).toBeInTheDocument()
  })

  it('saves settings without leaking the SSL passphrase anywhere else', async () => {
    const vpn = { openconnect: {} }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<OpenconnectPage />)
    await screen.findAllByRole('button', { name: /save settings/i })

    await user.type(screen.getByLabelText(/listen port \(tcp\)/i), '8443')
    await user.type(screen.getByLabelText(/private key passphrase/i), 'super-secret-pass')
    await user.click(screen.getAllByRole('button', { name: /save settings/i })[0])

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'openconnect', 'listen-ports', 'tcp'],
      value: '8443',
    })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'openconnect', 'ssl', 'passphrase'],
      value: 'super-secret-pass',
    })
  })

  it('adds a local user with OTP fields without leaking secrets', async () => {
    const vpn = { openconnect: {} }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<OpenconnectPage />)
    await screen.findByRole('button', { name: /\+ add user/i })

    const addUserButton = screen.getByRole('button', { name: /\+ add user/i })
    const usersSection = addUserButton.closest('div.border-t')
    if (!usersSection) throw new Error('local users section not found')
    await user.click(addUserButton)
    await user.type(screen.getByPlaceholderText('username'), 'alice')
    await user.type(screen.getByPlaceholderText('password'), 'super-secret')
    await user.type(screen.getByPlaceholderText(/otp key/i), 'deadbeefdeadbeefdeadbeef')
    await user.click(within(usersSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'alice'],
    })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'openconnect', 'authentication', 'local-users', 'username', 'alice', 'otp', 'key'],
      value: 'deadbeefdeadbeefdeadbeef',
    })
  })

  it('toggles accounting RADIUS mode and adds an accounting RADIUS server', async () => {
    const vpn = { openconnect: {} }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<OpenconnectPage />)

    await user.click(await screen.findByRole('checkbox', { name: /use radius for accounting/i }))
    let { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'openconnect', 'accounting', 'mode', 'radius'],
    })

    const accountingHeading = screen.getByText('Accounting')
    const accountingSection = accountingHeading.closest('div')
    if (!accountingSection) throw new Error('accounting section not found')
    await user.click(within(accountingSection as HTMLElement).getByRole('button', { name: /\+ add server/i }))
    await user.type(within(accountingSection as HTMLElement).getByPlaceholderText('192.0.2.9'), '192.0.2.9')
    await user.click(within(accountingSection as HTMLElement).getByRole('button', { name: /^add server$/i }))

    ;({ changes } = usePendingChangesStore.getState())
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'openconnect', 'accounting', 'radius', 'server', '192.0.2.9'],
    })
  })

  it('disables OpenConnect entirely', async () => {
    const vpn = { openconnect: {} }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<OpenconnectPage />)

    await user.click(await screen.findByRole('button', { name: /disable openconnect entirely/i }))
    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({ op: 'delete', path: ['vpn', 'openconnect'] })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the settings form immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<OpenconnectPage />)

    await user.click(await screen.findByRole('button', { name: /enable openconnect/i }))

    expect(await screen.findByRole('button', { name: /\+ add user/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable openconnect entirely/i })).toBeInTheDocument()
  })

  it('reverts to the enable prompt immediately after clicking Disable, without committing', async () => {
    const vpn = { openconnect: {} }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<OpenconnectPage />)
    await screen.findByRole('button', { name: /disable openconnect entirely/i })

    await user.click(screen.getByRole('button', { name: /disable openconnect entirely/i }))

    expect(await screen.findByText(/openconnect is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enable openconnect/i })).toBeInTheDocument()
  })
})
