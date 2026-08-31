import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import LldpPage from './LldpPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('LldpPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<LldpPage />)

    expect(await screen.findByText(/lldp is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable lldp/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'lldp'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<LldpPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('creates a new interface entry', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { lldp: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<LldpPage />)
    await screen.findByRole('button', { name: /\+ new interface/i })

    await user.click(screen.getByRole('button', { name: /\+ new interface/i }))
    await user.type(screen.getByLabelText(/interface \(or "all"\)/i), 'eth0')
    await user.click(screen.getByRole('button', { name: /queue creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'lldp', 'interface', 'eth0'],
    })
  })

  it('saves legacy protocol settings', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { lldp: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<LldpPage />)
    await screen.findByRole('checkbox', { name: /^cdp/i })

    await user.click(screen.getByRole('checkbox', { name: /^cdp/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'lldp', 'legacy-protocols', 'cdp'],
    })
  })

  // Regression test: see store/pendingChanges.ts's withPendingEnable.
  it('shows the full list UI immediately after clicking Enable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<LldpPage />)

    await user.click(await screen.findByRole('button', { name: /enable lldp/i }))

    expect(await screen.findByRole('button', { name: /\+ new interface/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable lldp entirely/i })).toBeInTheDocument()
  })

  it('reverts to the enable prompt immediately after clicking Disable, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { lldp: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<LldpPage />)
    await screen.findByRole('button', { name: /\+ new interface/i })

    await user.click(screen.getByRole('button', { name: /disable lldp entirely/i }))

    expect(await screen.findByText(/lldp is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enable lldp/i })).toBeInTheDocument()
  })

  // Regression test: see store/pendingChanges.ts's latestPendingOp.
  it('can be re-enabled after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<LldpPage />)

    await user.click(await screen.findByRole('button', { name: /enable lldp/i }))
    await user.click(await screen.findByRole('button', { name: /disable lldp entirely/i }))
    await screen.findByRole('button', { name: /enable lldp/i })
    await user.click(screen.getByRole('button', { name: /enable lldp/i }))

    expect(await screen.findByRole('button', { name: /\+ new interface/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable lldp entirely/i })).toBeInTheDocument()
  })
})
