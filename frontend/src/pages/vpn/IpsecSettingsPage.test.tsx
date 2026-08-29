import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import IpsecSettingsPage from './IpsecSettingsPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('IpsecSettingsPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecSettingsPage />)

    expect(await screen.findByText(/ipsec is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable ipsec/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['vpn', 'ipsec'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<IpsecSettingsPage />)
    expect(await screen.findByText(/failed to load vpn configuration/i)).toBeInTheDocument()
  })

  it('saves settings and disables entirely', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: { ipsec: {} } })))
    const user = userEvent.setup()
    renderWithProviders(<IpsecSettingsPage />)
    await screen.findByRole('button', { name: /save settings/i })

    await user.click(screen.getByRole('checkbox', { name: /allow flexvpn vendor id/i }))
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    let { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({ op: 'set', path: ['vpn', 'ipsec', 'options', 'flexvpn'] })

    await user.click(screen.getByRole('button', { name: /disable ipsec entirely/i }))
    ;({ changes } = usePendingChangesStore.getState())
    expect(changes.map((c) => c.op)).toContainEqual({ op: 'delete', path: ['vpn', 'ipsec'] })
  })
})
