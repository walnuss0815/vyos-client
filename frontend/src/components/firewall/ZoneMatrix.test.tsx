import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import type { FirewallRuleset, FirewallZone } from '../../lib/firewallTypes'
import ZoneMatrix from './ZoneMatrix'

const zones: FirewallZone[] = [
  {
    name: 'LAN',
    localZone: false,
    interfaces: ['eth1'],
    defaultAction: 'drop',
    defaultLog: false,
    from: { WAN: 'WAN-LAN-v4' },
  },
  {
    name: 'WAN',
    localZone: false,
    interfaces: ['eth0'],
    defaultAction: 'drop',
    defaultLog: false,
    from: {},
  },
  {
    name: 'ROUTER',
    localZone: true,
    interfaces: [],
    defaultAction: 'drop',
    defaultLog: false,
    from: {},
  },
]

const rulesets: FirewallRuleset[] = [
  { id: 'WAN-LAN-v4', kind: 'custom', family: 'ipv4', rules: [] },
  { id: 'LAN-WAN-v4', kind: 'custom', family: 'ipv4', rules: [] },
]

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

describe('ZoneMatrix', () => {
  it('renders a header row/column for every zone', () => {
    renderWithProviders(<ZoneMatrix zones={zones} rulesets={rulesets} />)

    // Each zone name appears at least twice: once as a column header,
    // once as a row header.
    for (const name of ['LAN', 'WAN', 'ROUTER']) {
      expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('shows a configured ruleset as a link to the ruleset detail page', () => {
    renderWithProviders(<ZoneMatrix zones={zones} rulesets={rulesets} />)

    const link = screen.getByRole('link', { name: 'WAN-LAN-v4' })
    expect(link).toHaveAttribute('href', '/firewall/rulesets/ipv4/custom/WAN-LAN-v4')
  })

  it('marks the local zone', () => {
    renderWithProviders(<ZoneMatrix zones={zones} rulesets={rulesets} />)
    expect(screen.getByText('local')).toBeInTheDocument()
  })

  it('shows an "add" affordance for an empty cell', () => {
    renderWithProviders(<ZoneMatrix zones={zones} rulesets={rulesets} />)
    expect(
      screen.getByLabelText('Add ruleset for traffic from LAN to WAN'),
    ).toBeInTheDocument()
  })

  it('queues a set op when adding a ruleset to an empty cell', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZoneMatrix zones={zones} rulesets={rulesets} />)

    await user.click(screen.getByLabelText('Add ruleset for traffic from LAN to WAN'))
    await user.selectOptions(screen.getByRole('combobox'), 'LAN-WAN-v4')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'zone', 'WAN', 'from', 'LAN', 'firewall', 'name'],
      value: 'LAN-WAN-v4',
    })
  })

  it('queues a delete op when clearing a configured cell', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZoneMatrix zones={zones} rulesets={rulesets} />)

    await user.click(screen.getByLabelText('Edit ruleset for traffic from WAN to LAN'))
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['firewall', 'zone', 'LAN', 'from', 'WAN'],
    })
  })

  it('cancels editing without queuing a change', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ZoneMatrix zones={zones} rulesets={rulesets} />)

    await user.click(screen.getByLabelText('Add ruleset for traffic from LAN to WAN'))
    await user.click(screen.getByRole('button', { name: '✕' }))

    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
    expect(screen.getByLabelText('Add ruleset for traffic from LAN to WAN')).toBeInTheDocument()
  })

  it('includes a from-zone that has no top-level zone entry of its own', () => {
    const zonesWithDanglingFrom: FirewallZone[] = [
      {
        name: 'LAN',
        localZone: false,
        interfaces: [],
        defaultAction: 'drop',
        defaultLog: false,
        from: { GUEST: 'GUEST-LAN-v4' },
      },
    ]
    renderWithProviders(<ZoneMatrix zones={zonesWithDanglingFrom} rulesets={[]} />)
    expect(screen.getAllByText('GUEST').length).toBeGreaterThanOrEqual(1)
  })

  it('shows a message instead of an empty table when there are no zones', () => {
    renderWithProviders(<ZoneMatrix zones={[]} rulesets={[]} />)
    expect(screen.getByText(/no zones configured/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
