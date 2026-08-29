import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import SstpPage from './SstpPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('SstpPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<SstpPage />)

    expect(await screen.findByText(/sstp is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable sstp/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['vpn', 'sstp'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<SstpPage />)
    expect(await screen.findByText(/failed to load vpn configuration/i)).toBeInTheDocument()
  })

  it('saves SSTP-only ssl/port/host-name settings and has no outside-address field', async () => {
    const vpn = { sstp: {} }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<SstpPage />)
    await screen.findAllByRole('button', { name: /save settings/i })

    expect(screen.queryByLabelText(/outside address/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^port$/i), '8443')
    await user.type(screen.getByLabelText(/ca certificate/i), 'my-ca')
    await user.click(screen.getAllByRole('button', { name: /save settings/i })[0])

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({ op: 'set', path: ['vpn', 'sstp', 'port'], value: '8443' })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'sstp', 'ssl', 'ca-certificate'],
      value: 'my-ca',
    })
  })

  it('adds a radius server', async () => {
    const vpn = { sstp: {} }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<SstpPage />)
    await screen.findByRole('button', { name: /\+ add server/i })

    await user.click(screen.getByRole('button', { name: /\+ add server/i }))
    await user.type(screen.getByPlaceholderText('192.0.2.9'), '192.0.2.9')
    await user.type(screen.getByPlaceholderText(/shared secret/i), 'super-secret-key')
    await user.click(screen.getByRole('button', { name: /^add server$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'sstp', 'authentication', 'radius', 'server', '192.0.2.9'],
    })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['vpn', 'sstp', 'authentication', 'radius', 'server', '192.0.2.9', 'key'],
      value: 'super-secret-key',
    })
  })

  it('disables SSTP entirely', async () => {
    const vpn = { sstp: {} }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: vpn })))
    const user = userEvent.setup()
    renderWithProviders(<SstpPage />)

    await user.click(await screen.findByRole('button', { name: /disable sstp entirely/i }))
    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({ op: 'delete', path: ['vpn', 'sstp'] })
  })
})
