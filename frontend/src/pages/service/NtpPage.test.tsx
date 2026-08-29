import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import NtpPage from './NtpPage'

const SERVICE = {
  ntp: {
    server: { '0.pool.ntp.org': { prefer: {} } },
    'allow-client': { address: ['192.0.2.0/24'] },
    vrf: 'RED',
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: SERVICE })))
})

describe('NtpPage', () => {
  it('renders configured servers and general settings', async () => {
    renderWithProviders(<NtpPage />)

    expect(await screen.findByText('0.pool.ntp.org')).toBeInTheDocument()
    expect(screen.getByText('Prefer')).toBeInTheDocument()
    expect(screen.getByDisplayValue('RED')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.0/24')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<NtpPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('adds a new server with flags', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NtpPage />)
    await screen.findByText('0.pool.ntp.org')

    await user.click(screen.getByRole('button', { name: /\+ add server/i }))
    await user.type(screen.getByPlaceholderText('0.pool.ntp.org'), '192.0.2.1')
    await user.click(screen.getByRole('checkbox', { name: /^prefer/i }))
    await user.click(screen.getByRole('button', { name: /^add server$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'ntp', 'server', '192.0.2.1'],
    })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'ntp', 'server', '192.0.2.1', 'prefer'],
    })
  })

  it('removes a server', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NtpPage />)
    await screen.findByText('0.pool.ntp.org')

    const card = screen.getByText('0.pool.ntp.org').closest('div.rounded-xl')
    if (!card) throw new Error('server card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /remove/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['service', 'ntp', 'server', '0.pool.ntp.org'] })
  })

  it('saves general settings', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NtpPage />)
    await screen.findByText('0.pool.ntp.org')

    await user.selectOptions(screen.getByDisplayValue('Default (timezone)'), 'smear')
    await user.click(screen.getByRole('button', { name: /save general settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'ntp', 'leap-second'],
      value: 'smear',
    })
  })
})
