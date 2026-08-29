import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import RouteMapsPage from './RouteMapsPage'

const POLICY = {
  'route-map': {
    EXPORT: {
      description: 'export filter',
      rule: {
        '10': {
          action: 'permit',
          description: 'allow connected',
          match: { protocol: 'connected' },
        },
      },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: POLICY })))
})

describe('RouteMapsPage', () => {
  it('renders a route-map and its rule', async () => {
    renderWithProviders(<RouteMapsPage />)
    expect(await screen.findByText('EXPORT')).toBeInTheDocument()
    expect(screen.getByText('export filter')).toBeInTheDocument()
    expect(screen.getByText(/allow connected/)).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<RouteMapsPage />)
    expect(await screen.findByText(/failed to load policy configuration/i)).toBeInTheDocument()
  })

  it('creates a new route-map', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteMapsPage />)
    await screen.findByText('EXPORT')

    await user.click(screen.getByRole('button', { name: /\+ new route-map/i }))
    await user.type(screen.getByLabelText(/^name/i), 'IMPORT')
    await user.type(screen.getByLabelText(/^description/i), 'import filter')
    await user.click(screen.getByRole('button', { name: /queue route-map creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['policy', 'route-map', 'IMPORT', 'description'],
      value: 'import filter',
    })
  })

  it('creates a bare route-map with no description', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteMapsPage />)
    await screen.findByText('EXPORT')

    await user.click(screen.getByRole('button', { name: /\+ new route-map/i }))
    await user.type(screen.getByLabelText(/^name/i), 'BARE')
    await user.click(screen.getByRole('button', { name: /queue route-map creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['policy', 'route-map', 'BARE'] })
  })

  it('deletes a route-map', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteMapsPage />)
    await screen.findByText('EXPORT')

    await user.click(screen.getByRole('button', { name: /delete route-map/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['policy', 'route-map', 'EXPORT'] })
  })

  it('creates a new rule with match and set fields', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteMapsPage />)
    await screen.findByText('EXPORT')

    await user.click(screen.getByRole('button', { name: /\+ add rule/i }))
    await user.click(screen.getByRole('button', { name: 'match' }))
    await user.type(screen.getByLabelText(/as-path list/i), 'ASPL')
    await user.click(screen.getByRole('button', { name: 'set' }))
    await user.type(screen.getByLabelText(/^weight/i), '100')
    await user.click(screen.getByRole('button', { name: /queue new rule/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual(
      expect.arrayContaining([
        {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '20', 'match', 'as-path'],
          value: 'ASPL',
        },
        { op: 'set', path: ['policy', 'route-map', 'EXPORT', 'rule', '20', 'set', 'weight'], value: '100' },
      ]),
    )
  })

  it('edits an existing rule, queuing only the changed field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteMapsPage />)
    await screen.findByText(/allow connected/)

    const ruleRow = screen.getByText(/allow connected/).closest('li')
    if (!ruleRow) throw new Error('rule row not found')
    await user.click(within(ruleRow).getByRole('button', { name: /edit/i }))

    const descriptionInput = screen.getByLabelText(/description/i)
    await user.clear(descriptionInput)
    await user.type(descriptionInput, 'updated description')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      expect.objectContaining({
        op: {
          op: 'set',
          path: ['policy', 'route-map', 'EXPORT', 'rule', '10', 'description'],
          value: 'updated description',
        },
      }),
    ])
  })

  it('removes an existing rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteMapsPage />)
    await screen.findByText(/allow connected/)

    const ruleRow = screen.getByText(/allow connected/).closest('li')
    if (!ruleRow) throw new Error('rule row not found')
    await user.click(within(ruleRow).getByRole('button', { name: /remove/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['policy', 'route-map', 'EXPORT', 'rule', '10'] })
  })
})
