import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import MdnsPage from './MdnsPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('MdnsPage', () => {
  it('shows an enable prompt when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MdnsPage />)

    expect(await screen.findByText(/mdns repeater is not configured/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /enable mdns repeater/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['service', 'mdns', 'repeater'] })
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<MdnsPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('renders configured interfaces and saves settings', async () => {
    const mdns = { mdns: { repeater: { interface: ['eth0'] } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: mdns })))
    const user = userEvent.setup()
    renderWithProviders(<MdnsPage />)

    expect(await screen.findByText('eth0')).toBeInTheDocument()

    await user.selectOptions(screen.getByDisplayValue('Default (both)'), 'ipv4')
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'mdns', 'repeater', 'ip-version'],
      value: 'ipv4',
    })
  })
})
