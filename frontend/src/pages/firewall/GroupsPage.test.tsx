import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import GroupsPage from './GroupsPage'

const FIREWALL_CONFIG = {
  group: {
    'address-group': { SERVERS: { address: ['10.0.0.1', '10.0.0.2'], description: 'srv' } },
    'port-group': { WEB: { port: ['80', '443'] } },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: FIREWALL_CONFIG })))
})

describe('GroupsPage', () => {
  it('shows address groups by default', async () => {
    renderWithProviders(<GroupsPage />)
    expect(await screen.findByText('SERVERS')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.2')).toBeInTheDocument()
  })

  it('switches to another group type via the tab bar', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GroupsPage />)
    await screen.findByText('SERVERS')

    await user.click(screen.getByRole('button', { name: 'Port groups' }))

    expect(screen.getByText('WEB')).toBeInTheDocument()
    expect(screen.queryByText('SERVERS')).not.toBeInTheDocument()
  })

  it('queues adding a new member to an existing group', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GroupsPage />)
    await screen.findByText('SERVERS')

    const [memberInput] = screen.getAllByPlaceholderText(/10.0.0.1 or/i)
    await user.type(memberInput, '10.0.0.3')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'group', 'address-group', 'SERVERS', 'address'],
      value: '10.0.0.3',
    })
  })

  it('queues removing a member from a group', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GroupsPage />)
    await screen.findByText('SERVERS')

    await user.click(screen.getByLabelText('Remove 10.0.0.1 from group SERVERS'))

    const { changes } = usePendingChangesStore.getState()
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['firewall', 'group', 'address-group', 'SERVERS', 'address'],
      value: '10.0.0.1',
    })
  })

  it('creates a new group with a first member', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GroupsPage />)
    await screen.findByText('SERVERS')

    await user.click(screen.getByRole('button', { name: /new group/i }))
    await user.type(screen.getByPlaceholderText('SERVERS'), 'ADMINS')
    // The create form's "First member" input renders above the
    // existing SERVERS card's own "add member" input, which shares
    // the same placeholder text.
    const [firstMemberInput] = screen.getAllByPlaceholderText(/10.0.0.1 or/i)
    await user.type(firstMemberInput, '10.0.0.9')
    await user.click(screen.getByRole('button', { name: /queue group creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'group', 'address-group', 'ADMINS', 'address'],
      value: '10.0.0.9',
    })
  })

  // Regression test: RulesetsPage's CreateRulesetForm validated the
  // name against VyOS's identifier format client-side, but GroupsPage
  // only checked non-emptiness - a name with spaces or other invalid
  // characters was accepted here and only rejected after a round-trip
  // to VyOS's own commit-time validation. Both now share the same
  // isValidVyOSIdentifier check.
  it('rejects an invalid group name', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GroupsPage />)
    await screen.findByText('SERVERS')

    await user.click(screen.getByRole('button', { name: /new group/i }))
    await user.type(screen.getByPlaceholderText('SERVERS'), 'invalid name with spaces')
    const [firstMemberInput] = screen.getAllByPlaceholderText(/10.0.0.1 or/i)
    await user.type(firstMemberInput, '10.0.0.9')

    expect(screen.getByRole('button', { name: /queue group creation/i })).toBeDisabled()
  })
})
