import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import MatchGroupsPage from './MatchGroupsPage'

const QOS_CONFIG = {
  'traffic-match-group': {
    WEB: { description: 'web traffic', match: { http: { ip: { destination: { port: '80,443' } } } } },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: QOS_CONFIG })))
})

describe('MatchGroupsPage', () => {
  it('shows an error message when the config fails to load', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<MatchGroupsPage />)
    expect(await screen.findByText(/failed to load qos configuration/i)).toBeInTheDocument()
  })

  it('renders the match group and its match rule after expanding', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MatchGroupsPage />)
    expect(await screen.findByText('WEB')).toBeInTheDocument()
    expect(screen.getByText('web traffic')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Manage' }))
    expect(await screen.findByText(/http:/)).toBeInTheDocument()
  })

  it('adds a new match group', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MatchGroupsPage />)
    await screen.findByText('WEB')

    await user.click(screen.getByRole('button', { name: '+ Add group' }))
    await user.type(screen.getByPlaceholderText('WEB'), 'VOIP')
    await user.click(screen.getByRole('button', { name: 'Add group' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.some((c) => c.op.op === 'set' && c.op.path.join(' ') === 'qos traffic-match-group VOIP')).toBe(true)
  })

  it('deletes a match group', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MatchGroupsPage />)
    await screen.findByText('WEB')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const { changes } = usePendingChangesStore.getState()
    expect(changes).toContainEqual(
      expect.objectContaining({ op: { op: 'delete', path: ['qos', 'traffic-match-group', 'WEB'] } }),
    )
  })
})
