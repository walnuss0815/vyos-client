import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import StaticRulesPage from './StaticRulesPage'

const NAT = {
  static: {
    rule: {
      '2000': {
        description: '1-to-1 NAT example',
        destination: { address: '192.0.2.30' },
        'inbound-interface': 'eth1',
        translation: { address: '192.168.1.10' },
      },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: NAT })))
})

describe('StaticRulesPage', () => {
  it('renders a static NAT rule', async () => {
    renderWithProviders(<StaticRulesPage />)

    expect(await screen.findByText('192.0.2.30 → 192.168.1.10')).toBeInTheDocument()
    expect(screen.getByText('1-to-1 NAT example')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<StaticRulesPage />)
    expect(await screen.findByText(/failed to load nat configuration/i)).toBeInTheDocument()
  })

  it('creates a new static rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRulesPage />)
    await screen.findByText('1-to-1 NAT example')

    await user.click(screen.getByRole('button', { name: /\+ add rule/i }))
    const numberInput = screen.getByLabelText(/rule number/i)
    await user.type(numberInput, '3000')
    await user.type(screen.getByPlaceholderText('192.0.2.30'), '198.51.100.5')
    await user.type(screen.getByPlaceholderText('192.168.1.10'), '10.0.0.5')
    await user.click(screen.getByRole('button', { name: /queue rule creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual(
      expect.arrayContaining([
        {
          op: 'set',
          path: ['nat', 'static', 'rule', '3000', 'destination', 'address'],
          value: '198.51.100.5',
        },
        {
          op: 'set',
          path: ['nat', 'static', 'rule', '3000', 'translation', 'address'],
          value: '10.0.0.5',
        },
      ]),
    )
  })

  it('deletes an existing rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StaticRulesPage />)
    await screen.findByText('1-to-1 NAT example')

    const card = screen.getByText('1-to-1 NAT example').closest('div.rounded-lg')
    if (!card) throw new Error('rule card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /delete/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['nat', 'static', 'rule', '2000'] })
  })
})
