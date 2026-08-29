import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ListsPage from './ListsPage'

const POLICY = {
  'as-path-list': { ASPL: { rule: { '10': { action: 'permit', regex: '^64512' } } } },
  'community-list': { CL: { rule: { '10': { regex: 'no-export' } } } },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: POLICY })))
})

describe('ListsPage', () => {
  it('renders AS-Path lists by default', async () => {
    renderWithProviders(<ListsPage />)
    expect(await screen.findByText('ASPL')).toBeInTheDocument()
    expect(screen.queryByText('CL')).not.toBeInTheDocument()
  })

  it('switches to community lists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ListsPage />)
    await screen.findByText('ASPL')

    await user.click(screen.getByRole('button', { name: 'Community' }))

    expect(await screen.findByText('CL')).toBeInTheDocument()
    expect(screen.queryByText('ASPL')).not.toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<ListsPage />)
    expect(await screen.findByText(/failed to load policy configuration/i)).toBeInTheDocument()
  })

  it('creates a new as-path list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ListsPage />)
    await screen.findByText('ASPL')

    await user.click(screen.getByRole('button', { name: /\+ new list/i }))
    await user.type(screen.getByLabelText(/^name/i), 'ASPL-NEW')
    await user.type(screen.getByLabelText(/^description/i), 'upstream filter')
    await user.click(screen.getByRole('button', { name: /queue list creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['policy', 'as-path-list', 'ASPL-NEW', 'description'],
      value: 'upstream filter',
    })
  })

  it('deletes an existing list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ListsPage />)
    await screen.findByText('ASPL')

    await user.click(screen.getByRole('button', { name: /delete list/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['policy', 'as-path-list', 'ASPL'] })
  })

  it('adds a rule to an existing list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ListsPage />)
    await screen.findByText('ASPL')

    await user.click(screen.getByRole('button', { name: /\+ add rule/i }))
    await user.type(screen.getByPlaceholderText('rule #'), '20')
    await user.type(screen.getByPlaceholderText('^64512'), '^64513')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['policy', 'as-path-list', 'ASPL', 'rule', '20', 'regex'],
      value: '^64513',
    })
  })
})
