import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ZonesPage from './ZonesPage'

const FIREWALL_CONFIG = {
  zone: {
    LAN: {
      description: 'Main LAN',
      interface: ['eth1', 'eth2'],
      'default-action': 'drop',
      from: { WAN: { firewall: { name: 'WAN-LAN-v4' } } },
    },
    WAN: { interface: 'eth0', 'default-action': 'drop' },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: FIREWALL_CONFIG })))
})

describe('ZonesPage', () => {
  it('renders zones with their interfaces and from-rulesets', async () => {
    renderWithProviders(<ZonesPage />)

    expect(await screen.findByText('LAN')).toBeInTheDocument()
    expect(screen.getByText('Main LAN')).toBeInTheDocument()
    expect(screen.getByText('eth1')).toBeInTheDocument()
    expect(screen.getByText('eth2')).toBeInTheDocument()
    expect(screen.getByText(/WAN-LAN-v4/)).toBeInTheDocument()
    expect(screen.getByText('WAN')).toBeInTheDocument()
  })

  it('queues an interface removal', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZonesPage />)
    await screen.findByText('LAN')

    await user.click(screen.getByLabelText('Remove interface eth1 from zone LAN'))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['firewall', 'zone', 'LAN', 'interface'],
      value: 'eth1',
    })
  })

  it('queues a default-action change via the accessibly-labeled select', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZonesPage />)
    await screen.findByText('LAN')

    const [lanDefaultAction] = screen.getAllByLabelText(/default action/i)
    await user.selectOptions(lanDefaultAction, 'reject')

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'zone', 'LAN', 'default-action'],
      value: 'reject',
    })
  })

  it('queues zone deletion', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZonesPage />)
    await screen.findByText('LAN')

    const deleteButtons = screen.getAllByRole('button', { name: /delete zone/i })
    await user.click(deleteButtons[0])

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['firewall', 'zone', 'LAN'] })
  })

  it('creates a new zone with member interfaces and a default action', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZonesPage />)
    await screen.findByText('LAN')

    await user.click(screen.getByRole('button', { name: /new zone/i }))
    await user.type(screen.getByPlaceholderText('LAN'), 'DMZ')
    await user.type(screen.getByPlaceholderText('eth1, eth2'), 'eth3, eth4')
    await user.click(screen.getByRole('button', { name: /queue zone creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: { op: 'set', path: ['firewall', 'zone', 'DMZ', 'interface'], value: 'eth3' },
        }),
        expect.objectContaining({
          op: { op: 'set', path: ['firewall', 'zone', 'DMZ', 'interface'], value: 'eth4' },
        }),
        expect.objectContaining({
          op: { op: 'set', path: ['firewall', 'zone', 'DMZ', 'default-action'], value: 'drop' },
        }),
      ]),
    )
  })

  // Regression test: RulesetsPage's CreateRulesetForm validated the
  // name against VyOS's identifier format client-side, but ZonesPage
  // and GroupsPage only checked non-emptiness - a name with spaces or
  // other invalid characters was accepted here and only rejected after
  // a round-trip to VyOS's own commit-time validation. Both now share
  // the same isValidVyOSIdentifier check.
  it('rejects an invalid zone name', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZonesPage />)
    await screen.findByText('LAN')

    await user.click(screen.getByRole('button', { name: /new zone/i }))
    await user.type(screen.getByPlaceholderText('LAN'), 'invalid name with spaces')
    await user.click(screen.getByLabelText(/this is the local zone/i))

    expect(screen.getByRole('button', { name: /queue zone creation/i })).toBeDisabled()
  })

  it('switches to the matrix view and back', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZonesPage />)
    await screen.findByText('LAN')

    // List view (default): zone cards, no matrix table.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Matrix' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'WAN-LAN-v4' }),
    ).toHaveAttribute('href', '/firewall/rulesets/ipv4/custom/WAN-LAN-v4')

    await user.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Remove interface eth1 from zone LAN')).toBeInTheDocument()
  })

  it('disables zone creation until a name and (interfaces or local-zone) are provided', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZonesPage />)
    await screen.findByText('LAN')

    await user.click(screen.getByRole('button', { name: /new zone/i }))
    expect(screen.getByRole('button', { name: /queue zone creation/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('LAN'), 'DMZ')
    expect(screen.getByRole('button', { name: /queue zone creation/i })).toBeDisabled()

    await user.click(screen.getByLabelText(/this is the local zone/i))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /queue zone creation/i })).toBeEnabled()
    })
  })
})
