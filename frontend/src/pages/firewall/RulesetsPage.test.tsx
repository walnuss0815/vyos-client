import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import RulesetsPage from './RulesetsPage'

const FIREWALL_CONFIG = {
  ipv4: {
    forward: { filter: { 'default-action': 'drop', rule: { '10': { action: 'accept' } } } },
    name: {
      'WAN-LAN-v4': { 'default-action': 'drop', rule: {} },
    },
  },
  ipv6: {
    name: {
      'WAN-LAN-v6': { 'default-action': 'drop', rule: {} },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: FIREWALL_CONFIG })))
})

describe('RulesetsPage', () => {
  it('lists base and custom rulesets with rule counts', async () => {
    renderWithProviders(<RulesetsPage />)

    expect(await screen.findByText('forward')).toBeInTheDocument()
    expect(screen.getByText('WAN-LAN-v4')).toBeInTheDocument()
    expect(screen.getByText('WAN-LAN-v6')).toBeInTheDocument()
    expect(screen.getByText('Base chain')).toBeInTheDocument()
    expect(screen.getAllByText('Custom chain')).toHaveLength(2)
  })

  it('shows each ruleset\'s family', async () => {
    renderWithProviders(<RulesetsPage />)
    await screen.findByText('forward')

    expect(screen.getAllByText('ipv4').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('ipv6').length).toBeGreaterThanOrEqual(1)
  })

  it('links each ruleset to its detail page, including its family', async () => {
    renderWithProviders(<RulesetsPage />)
    await screen.findByText('forward')

    expect(screen.getByRole('link', { name: 'forward' })).toHaveAttribute(
      'href',
      '/firewall/rulesets/ipv4/base/forward',
    )
    expect(screen.getByRole('link', { name: 'WAN-LAN-v4' })).toHaveAttribute(
      'href',
      '/firewall/rulesets/ipv4/custom/WAN-LAN-v4',
    )
    expect(screen.getByRole('link', { name: 'WAN-LAN-v6' })).toHaveAttribute(
      'href',
      '/firewall/rulesets/ipv6/custom/WAN-LAN-v6',
    )
  })

  it('creates a new custom ruleset with a default-action of drop, defaulting to ipv4', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RulesetsPage />)
    await screen.findByText('forward')

    await user.click(screen.getByRole('button', { name: /new custom ruleset/i }))
    await user.type(screen.getByPlaceholderText('WAN-LAN-v4'), 'DMZ-LAN-v4')
    await user.click(screen.getByRole('button', { name: /queue ruleset creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'name', 'DMZ-LAN-v4', 'default-action'],
      value: 'drop',
    })
  })

  it('creates a new ipv6 custom ruleset when the family selector is changed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RulesetsPage />)
    await screen.findByText('forward')

    await user.click(screen.getByRole('button', { name: /new custom ruleset/i }))
    await user.type(screen.getByPlaceholderText('WAN-LAN-v4'), 'DMZ-LAN-v6')
    await user.selectOptions(screen.getByLabelText(/family/i), 'ipv6')
    await user.click(screen.getByRole('button', { name: /queue ruleset creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'ipv6', 'name', 'DMZ-LAN-v6', 'default-action'],
      value: 'drop',
    })
  })

  // Regression test: a ruleset's first rule used to only be addable
  // AFTER the ruleset already existed - RuleForm.tsx is only ever
  // reachable from RulesetDetailPage.tsx, which requires the ruleset
  // to already be in the fetched list.
  it('creates a new custom ruleset with a first rule, all in one commit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RulesetsPage />)
    await screen.findByText('forward')

    await user.click(screen.getByRole('button', { name: /new custom ruleset/i }))
    await user.type(screen.getByPlaceholderText('WAN-LAN-v4'), 'DMZ-LAN-v4')
    await user.selectOptions(screen.getByLabelText(/^action/i), 'accept')
    await user.type(screen.getByPlaceholderText('tcp'), 'tcp')
    await user.click(screen.getByRole('button', { name: /queue ruleset creation/i }))

    const ops = usePendingChangesStore.getState().changes.map((c) => c.op)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'name', 'DMZ-LAN-v4', 'default-action'],
      value: 'drop',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'name', 'DMZ-LAN-v4', 'rule', '10', 'action'],
      value: 'accept',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'name', 'DMZ-LAN-v4', 'rule', '10', 'protocol'],
      value: 'tcp',
    })
  })

  it('rejects an invalid ruleset name', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RulesetsPage />)
    await screen.findByText('forward')

    await user.click(screen.getByRole('button', { name: /new custom ruleset/i }))
    await user.type(screen.getByPlaceholderText('WAN-LAN-v4'), 'invalid name with spaces')

    expect(screen.getByRole('button', { name: /queue ruleset creation/i })).toBeDisabled()
  })
})
