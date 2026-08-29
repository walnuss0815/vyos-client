import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import SourceRulesPage from './SourceRulesPage'

const NAT = {
  source: {
    rule: {
      '100': {
        description: 'LAN to WAN',
        'outbound-interface': { name: 'eth0' },
        source: { address: '192.168.0.0/24' },
        translation: { address: 'masquerade' },
      },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: NAT })))
})

describe('SourceRulesPage', () => {
  it('renders a source NAT rule with its match/translation summary', async () => {
    renderWithProviders(<SourceRulesPage />)

    expect(await screen.findByText('100')).toBeInTheDocument()
    expect(screen.getByText('LAN to WAN')).toBeInTheDocument()
    expect(screen.getByText('eth0')).toBeInTheDocument()
    expect(screen.getByText('192.168.0.0/24')).toBeInTheDocument()
    expect(screen.getByText('masquerade')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<SourceRulesPage />)
    expect(await screen.findByText(/failed to load nat configuration/i)).toBeInTheDocument()
  })

  it('creates a new masquerade rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SourceRulesPage />)
    await screen.findByText('100')

    await user.click(screen.getByRole('button', { name: /\+ add rule/i }))
    await user.type(screen.getByLabelText(/outbound interface/i), 'eth1')
    await user.click(screen.getByRole('button', { name: 'match' }))
    const sourceFields = screen.getByText('Source', { selector: 'h4' }).closest('div')
    if (!sourceFields) throw new Error('source match fields not found')
    await user.type(within(sourceFields as HTMLElement).getByLabelText(/^address$/i), '10.0.0.0/24')
    await user.click(screen.getByRole('button', { name: 'translation' }))
    await user.type(screen.getByLabelText(/translation address/i), 'masquerade')
    await user.click(screen.getByRole('button', { name: /queue new rule/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual(
      expect.arrayContaining([
        { op: 'set', path: ['nat', 'source', 'rule', '110', 'outbound-interface', 'name'], value: 'eth1' },
        { op: 'set', path: ['nat', 'source', 'rule', '110', 'source', 'address'], value: '10.0.0.0/24' },
        { op: 'set', path: ['nat', 'source', 'rule', '110', 'translation', 'address'], value: 'masquerade' },
      ]),
    )
  })

  it('deletes an existing rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SourceRulesPage />)
    await screen.findByText('100')

    const row = screen.getByText('100').closest('tr')
    if (!row) throw new Error('rule row not found')
    await user.click(within(row).getByRole('button', { name: /delete/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['nat', 'source', 'rule', '100'] })
  })

  it('edits an existing rule, queuing only the changed field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SourceRulesPage />)
    await screen.findByText('100')

    const row = screen.getByText('100').closest('tr')
    if (!row) throw new Error('rule row not found')
    await user.click(within(row).getByRole('button', { name: /edit/i }))

    const descriptionInput = screen.getByLabelText(/description/i)
    await user.clear(descriptionInput)
    await user.type(descriptionInput, 'Updated description')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      expect.objectContaining({
        op: {
          op: 'set',
          path: ['nat', 'source', 'rule', '100', 'description'],
          value: 'Updated description',
        },
      }),
    ])
  })

  it('queues group matching for a new rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SourceRulesPage />)
    await screen.findByText('100')

    await user.click(screen.getByRole('button', { name: /\+ add rule/i }))
    await user.click(screen.getByRole('button', { name: 'match' }))
    const sourceFields = screen.getByText('Source', { selector: 'h4' }).closest('div')
    if (!sourceFields) throw new Error('source match fields not found')
    await user.type(within(sourceFields as HTMLElement).getByLabelText(/address group/i), 'LAN_HOSTS')
    await user.click(screen.getByRole('button', { name: /queue new rule/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['nat', 'source', 'rule', '110', 'source', 'group', 'address-group'],
      value: 'LAN_HOSTS',
    })
  })
})
