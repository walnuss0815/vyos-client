import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import DestinationRulesPage from './DestinationRulesPage'

const NAT = {
  destination: {
    rule: {
      '10': {
        description: 'Port Forward: HTTP',
        'inbound-interface': { name: 'eth0' },
        destination: { port: '80' },
        protocol: 'tcp',
        translation: { address: '192.168.0.100' },
      },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: NAT })))
})

describe('DestinationRulesPage', () => {
  it('renders a destination NAT rule', async () => {
    renderWithProviders(<DestinationRulesPage />)

    expect(await screen.findByText('10')).toBeInTheDocument()
    expect(screen.getByText('Port Forward: HTTP')).toBeInTheDocument()
    expect(screen.getByText(':80')).toBeInTheDocument()
    expect(screen.getByText('192.168.0.100')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<DestinationRulesPage />)
    expect(await screen.findByText(/failed to load nat configuration/i)).toBeInTheDocument()
  })

  it('creates a redirect-to-localhost rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DestinationRulesPage />)
    await screen.findByText('10')

    await user.click(screen.getByRole('button', { name: /\+ add rule/i }))
    await user.click(screen.getByRole('button', { name: 'translation' }))
    await user.type(screen.getByLabelText(/redirect to local host/i), '22')
    await user.click(screen.getByRole('button', { name: /queue new rule/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['nat', 'destination', 'rule', '20', 'translation', 'redirect', 'port'],
      value: '22',
    })
  })

  it('deletes an existing rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DestinationRulesPage />)
    await screen.findByText('10')

    const row = screen.getByText('10').closest('tr')
    if (!row) throw new Error('rule row not found')
    await user.click(within(row).getByRole('button', { name: /delete/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['nat', 'destination', 'rule', '10'] })
  })
})
