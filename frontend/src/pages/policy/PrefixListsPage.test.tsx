import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import PrefixListsPage from './PrefixListsPage'

const POLICY = {
  'prefix-list': {
    'PL4-EXAMPLE': {
      description: 'v4 example',
      rule: { '10': { action: 'permit', prefix: '192.0.2.0/24', le: '32' } },
    },
  },
  'prefix-list6': {
    'PL6-EXAMPLE': {
      rule: { '10': { action: 'permit', prefix: '2001:db8::/32' } },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: POLICY })))
})

describe('PrefixListsPage', () => {
  it('renders IPv4 prefix lists by default', async () => {
    renderWithProviders(<PrefixListsPage />)
    expect(await screen.findByText('PL4-EXAMPLE')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.0/24')).toBeInTheDocument()
    expect(screen.queryByText('PL6-EXAMPLE')).not.toBeInTheDocument()
  })

  it('switches to IPv6 prefix lists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PrefixListsPage />)
    await screen.findByText('PL4-EXAMPLE')

    await user.click(screen.getByRole('button', { name: 'IPv6' }))

    expect(await screen.findByText('PL6-EXAMPLE')).toBeInTheDocument()
    expect(screen.queryByText('PL4-EXAMPLE')).not.toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<PrefixListsPage />)
    expect(await screen.findByText(/failed to load policy configuration/i)).toBeInTheDocument()
  })

  it('creates a new prefix list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PrefixListsPage />)
    await screen.findByText('PL4-EXAMPLE')

    await user.click(screen.getByRole('button', { name: /\+ new list/i }))
    await user.type(screen.getByLabelText(/^name/i), 'PL4-NEW')
    await user.type(screen.getByLabelText(/^description/i), 'a new list')
    await user.click(screen.getByRole('button', { name: /queue list creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['policy', 'prefix-list', 'PL4-NEW', 'description'],
      value: 'a new list',
    })
  })

  it('also queues a first rule when creating a prefix list with its optional fields filled in', async () => {
    // Regression test: a list's rules used to only be configurable
    // AFTER the list already existed - RulesSection only ever
    // operates on an already-fetched list.
    const user = userEvent.setup()
    renderWithProviders(<PrefixListsPage />)
    await screen.findByText('PL4-EXAMPLE')

    await user.click(screen.getByRole('button', { name: /\+ new list/i }))
    await user.type(screen.getByLabelText(/^name/i), 'PL4-NEW')
    await user.type(screen.getByLabelText(/^description/i), 'a new list')
    await user.selectOptions(screen.getByLabelText(/^action/i), 'deny')
    await user.type(screen.getByLabelText(/^prefix/i), '198.51.100.0/24')
    await user.click(screen.getByRole('button', { name: /queue list creation/i }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['policy', 'prefix-list', 'PL4-NEW', 'rule', '10', 'action'],
      value: 'deny',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['policy', 'prefix-list', 'PL4-NEW', 'rule', '10', 'prefix'],
      value: '198.51.100.0/24',
    })
  })

  it('deletes a prefix list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PrefixListsPage />)
    await screen.findByText('PL4-EXAMPLE')

    await user.click(screen.getByRole('button', { name: /delete list/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['policy', 'prefix-list', 'PL4-EXAMPLE'] })
  })

  it('adds a rule to an existing prefix list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PrefixListsPage />)
    await screen.findByText('PL4-EXAMPLE')

    await user.click(screen.getByRole('button', { name: /\+ add rule/i }))
    await user.type(screen.getByPlaceholderText('rule #'), '20')
    await user.type(screen.getByPlaceholderText('192.0.2.0/24'), '198.51.100.0/24')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['policy', 'prefix-list', 'PL4-EXAMPLE', 'rule', '20', 'prefix'],
      value: '198.51.100.0/24',
    })
  })

  it('removes an existing rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PrefixListsPage />)
    await screen.findByText('PL4-EXAMPLE')

    const row = screen.getByText('192.0.2.0/24').closest('li')
    if (!row) throw new Error('rule row not found')
    await user.click(within(row).getByRole('button', { name: /remove/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['policy', 'prefix-list', 'PL4-EXAMPLE', 'rule', '10'],
    })
  })
})
