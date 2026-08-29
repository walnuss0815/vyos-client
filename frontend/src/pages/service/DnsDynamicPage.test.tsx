import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import DnsDynamicPage from './DnsDynamicPage'

const SERVICE = {
  dns: {
    dynamic: {
      name: {
        home: {
          protocol: 'cloudflare',
          address: { interface: 'eth0' },
          'host-name': ['home.example.com'],
        },
      },
      interval: '600',
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: SERVICE })))
})

describe('DnsDynamicPage', () => {
  it('renders entries and their host names', async () => {
    renderWithProviders(<DnsDynamicPage />)

    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(screen.getByText(/cloudflare/)).toBeInTheDocument()
    expect(screen.getByText(/via eth0/)).toBeInTheDocument()
    expect(screen.getByText('home.example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('600')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<DnsDynamicPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('creates a new entry with a web-based address', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DnsDynamicPage />)
    await screen.findByText('home')

    await user.click(screen.getByRole('button', { name: /\+ new entry/i }))
    await user.type(screen.getByLabelText(/^name/i), 'office')
    await user.click(screen.getByRole('radio', { name: /from a web lookup/i }))
    await user.type(screen.getByPlaceholderText('https://checkip.example.com'), 'https://checkip.example.com')
    await user.click(screen.getByRole('button', { name: /queue entry creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'dns', 'dynamic', 'name', 'office', 'address', 'web', 'url'],
      value: 'https://checkip.example.com',
    })
  })

  it('deletes an entry', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DnsDynamicPage />)
    await screen.findByText('home')

    const card = screen.getByText('home').closest('div.rounded-xl')
    if (!card) throw new Error('entry card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'delete',
      path: ['service', 'dns', 'dynamic', 'name', 'home'],
    })
  })

  it('saves global settings', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DnsDynamicPage />)
    await screen.findByText('home')

    await user.clear(screen.getByDisplayValue('600'))
    await user.type(screen.getByPlaceholderText('300'), '900')
    await user.click(screen.getByRole('button', { name: /save global settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'dns', 'dynamic', 'interval'],
      value: '900',
    })
  })
})
