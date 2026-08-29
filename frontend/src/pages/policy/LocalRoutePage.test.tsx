import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import LocalRoutePage from './LocalRoutePage'

const POLICY = {
  'local-route': {
    rule: {
      '100': {
        protocol: 'tcp',
        source: { address: ['192.0.2.0/24'] },
        set: { table: '100' },
      },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: POLICY })))
})

describe('LocalRoutePage', () => {
  it('renders a local-route rule with its source addresses', async () => {
    renderWithProviders(<LocalRoutePage />)
    expect(await screen.findByText('#100')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.0/24')).toBeInTheDocument()
    expect(screen.getByText('table 100')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<LocalRoutePage />)
    expect(await screen.findByText(/failed to load policy configuration/i)).toBeInTheDocument()
  })

  it('creates a new rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LocalRoutePage />)
    await screen.findByText('#100')

    await user.click(screen.getByRole('button', { name: /\+ new rule/i }))
    await user.type(screen.getByLabelText(/rule number/i), '200')
    await user.type(screen.getByLabelText(/^protocol/i), 'udp')
    await user.click(screen.getByRole('button', { name: /queue rule creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['policy', 'local-route', 'rule', '200', 'protocol'],
      value: 'udp',
    })
  })

  it('deletes an existing rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LocalRoutePage />)
    await screen.findByText('#100')

    const ruleCard = screen.getByText('#100').closest('div.rounded-lg')
    if (!ruleCard) throw new Error('rule card not found')
    await user.click(within(ruleCard as HTMLElement).getByRole('button', { name: /delete/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['policy', 'local-route', 'rule', '100'] })
  })

  it('adds a source address via the ChipList', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LocalRoutePage />)
    await screen.findByText('192.0.2.0/24')

    const sourceSection = screen.getByText('Source addresses').closest('div')
    if (!sourceSection) throw new Error('source addresses section not found')
    await user.type(within(sourceSection as HTMLElement).getByPlaceholderText('192.0.2.0/24'), '198.51.100.0/24')
    await user.click(within(sourceSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['policy', 'local-route', 'rule', '100', 'source', 'address'],
      value: '198.51.100.0/24',
    })
  })

  it('switches to IPv6 rules', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LocalRoutePage />)
    await screen.findByText('#100')

    await user.click(screen.getByRole('button', { name: 'IPv6' }))

    expect(await screen.findByText(/no rules configured yet/i)).toBeInTheDocument()
    expect(screen.queryByText('#100')).not.toBeInTheDocument()
  })
})
