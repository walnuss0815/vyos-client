import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import RulesetDetailPage from './RulesetDetailPage'

const FIREWALL_CONFIG = {
  ipv4: {
    forward: {
      filter: {
        'default-action': 'drop',
        rule: {
          '10': { action: 'accept', protocol: 'tcp', description: 'allow web', destination: { port: '443' } },
          '20': { action: 'drop', description: 'block rest' },
        },
      },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: FIREWALL_CONFIG })))
})

function renderDetail(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/firewall/rulesets/:family/:kind/:id" element={<RulesetDetailPage />} />
    </Routes>,
    { route },
  )
}

describe('RulesetDetailPage', () => {
  it('renders the ruleset rules sorted, with action and match summaries', async () => {
    renderDetail('/firewall/rulesets/ipv4/base/forward')

    expect(await screen.findByText('forward')).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('accept')).toBeInTheDocument()
    expect(table.getByText('drop')).toBeInTheDocument()
    expect(table.getByText('allow web')).toBeInTheDocument()
    expect(table.getByText(':443')).toBeInTheDocument()
  })

  // Regression test: a rule with only a domain-group or mac-group
  // match configured (e.g. created via the Config Tree fallback,
  // before RuleForm exposed inputs for either) used to show "any" in
  // the summary table, even though a meaningful match criterion was
  // actually configured - summarizeMatch didn't check these fields at
  // all.
  it('includes MAC group and domain group in the match summary', async () => {
    server.use(
      http.get('/api/config/tree', () =>
        HttpResponse.json({
          data: {
            ipv4: {
              forward: {
                filter: {
                  'default-action': 'drop',
                  rule: {
                    '10': {
                      action: 'accept',
                      source: { group: { 'mac-group': 'KNOWN-DEVICES' } },
                      destination: { group: { 'domain-group': 'BLOCKED-ADS' } },
                    },
                  },
                },
              },
            },
          },
        }),
      ),
    )
    renderDetail('/firewall/rulesets/ipv4/base/forward')
    await screen.findByText('forward')

    const table = within(screen.getByRole('table'))
    expect(table.getByText('grp:KNOWN-DEVICES')).toBeInTheDocument()
    expect(table.getByText('grp:BLOCKED-ADS')).toBeInTheDocument()
  })

  it('redirects unknown ruleset kinds back to the list', async () => {
    renderDetail('/firewall/rulesets/ipv4/not-a-kind/forward')
    // No matching route param value -> component navigates away rather
    // than rendering; nothing from the detail page should appear.
    expect(screen.queryByText('forward')).not.toBeInTheDocument()
  })

  it('redirects unknown ruleset families back to the list', async () => {
    renderDetail('/firewall/rulesets/ipv5/base/forward')
    expect(screen.queryByText('forward')).not.toBeInTheDocument()
  })

  it('shows a not-found message for a ruleset with no configuration', async () => {
    renderDetail('/firewall/rulesets/ipv4/custom/DOES-NOT-EXIST')
    expect(await screen.findByText(/not found/i)).toBeInTheDocument()
  })

  it('queues a rule deletion', async () => {
    const user = userEvent.setup()
    renderDetail('/firewall/rulesets/ipv4/base/forward')
    await screen.findByText('forward')

    const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i })
    await user.click(deleteButtons[0])

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10'],
    })
  })

  // Regression test: deleting a rule while its own edit form was still
  // open didn't close that form. Submitting it afterward diffed the
  // edited values against the original rule and queued `set` ops for
  // the same path *after* the delete op already queued - resurrecting
  // the rule with the edited values instead of it actually being
  // deleted.
  it('closes the edit form when the rule being edited is deleted, so it cannot be resurrected by a stale submit', async () => {
    const user = userEvent.setup()
    renderDetail('/firewall/rulesets/ipv4/base/forward')
    await screen.findByText('forward')

    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0])
    expect(await screen.findByText('Edit rule 10')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /^delete$/i })[0])

    expect(screen.queryByText('Edit rule 10')).not.toBeInTheDocument()
    // Only the delete should ever be queued - nothing from the form
    // submission that's no longer reachable.
    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10'],
    })
  })

  it('leaves a different rule\u2019s edit form open when another rule is deleted', async () => {
    const user = userEvent.setup()
    renderDetail('/firewall/rulesets/ipv4/base/forward')
    await screen.findByText('forward')

    await user.click(screen.getAllByRole('button', { name: /^edit$/i })[0])
    expect(await screen.findByText('Edit rule 10')).toBeInTheDocument()

    // Delete rule 20 instead - editing rule 10's form is unrelated and
    // should be unaffected.
    await user.click(screen.getAllByRole('button', { name: /^delete$/i })[1])

    expect(screen.getByText('Edit rule 10')).toBeInTheDocument()
  })

  it('adds a new rule via the rule form', async () => {
    const user = userEvent.setup()
    renderDetail('/firewall/rulesets/ipv4/base/forward')
    await screen.findByText('forward')

    await user.click(screen.getByRole('button', { name: /add rule/i }))
    // Suggested next number after 10, 20 should be 30.
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^action/i), 'accept')
    await user.click(screen.getByRole('button', { name: /queue new rule/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '30', 'action'],
      value: 'accept',
    })
  })

  it('edits an existing rule, queuing only the changed field', async () => {
    const user = userEvent.setup()
    renderDetail('/firewall/rulesets/ipv4/base/forward')
    await screen.findByText('forward')

    const editButtons = screen.getAllByRole('button', { name: /^edit$/i })
    await user.click(editButtons[0])

    expect(await screen.findByText('Edit rule 10')).toBeInTheDocument()
    const protocolInput = screen.getByDisplayValue('tcp')
    await user.clear(protocolInput)
    await user.type(protocolInput, 'udp')
    await user.click(screen.getByRole('button', { name: /queue changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'protocol'],
      value: 'udp',
    })
  })

  it('shows the family badge and queues an ipv6 rule change under the icmpv6 node', async () => {
    server.use(
      http.get('/api/config/tree', () =>
        HttpResponse.json({
          data: {
            ipv6: {
              name: {
                'WAN-LAN-v6': {
                  'default-action': 'drop',
                  rule: { '10': { action: 'accept', icmpv6: { 'type-name': 'echo-request' } } },
                },
              },
            },
          },
        }),
      ),
    )
    const user = userEvent.setup()
    renderDetail('/firewall/rulesets/ipv6/custom/WAN-LAN-v6')
    await screen.findByText('WAN-LAN-v6')

    expect(screen.getByText('ipv6')).toBeInTheDocument()

    const editButtons = screen.getAllByRole('button', { name: /^edit$/i })
    await user.click(editButtons[0])
    await screen.findByText('Edit rule 10')
    await user.click(screen.getByRole('button', { name: 'advanced' }))

    expect(screen.getByDisplayValue('echo-request')).toBeInTheDocument()
    const icmpInput = screen.getByLabelText(/icmpv6 type name/i)
    await user.clear(icmpInput)
    await user.type(icmpInput, 'echo-reply')
    await user.click(screen.getByRole('button', { name: /queue changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'ipv6', 'name', 'WAN-LAN-v6', 'rule', '10', 'icmpv6', 'type-name'],
      value: 'echo-reply',
    })
  })

  // Drag-and-drop itself isn't reliably simulatable in jsdom, but the
  // Move up/down buttons exercise the exact same reorderRule handler
  // (see RulesetDetailPage's own comment on why they're not just a
  // fallback) - full coverage of the reordering behavior without
  // flaky native-drag-event simulation. reorderRuleOps' own unit tests
  // (firewallRuleForm.test.ts) cover the numbering algorithm itself in
  // much more depth; this just confirms it's wired up correctly here.
  describe('reordering rules', () => {
    it('disables Move up on the first rule and Move down on the last', async () => {
      renderDetail('/firewall/rulesets/ipv4/base/forward')
      await screen.findByText('forward')

      expect(screen.getByLabelText('Move rule 10 up')).toBeDisabled()
      expect(screen.getByLabelText('Move rule 20 down')).toBeDisabled()
      expect(screen.getByLabelText('Move rule 10 down')).toBeEnabled()
      expect(screen.getByLabelText('Move rule 20 up')).toBeEnabled()
    })

    it('queues a renumber when moving a rule down', async () => {
      const user = userEvent.setup()
      renderDetail('/firewall/rulesets/ipv4/base/forward')
      await screen.findByText('forward')

      await user.click(screen.getByLabelText('Move rule 10 down'))

      const { changes } = usePendingChangesStore.getState()
      const ops = changes.map((c) => c.op)
      // Rule 10 moves below rule 20 -> only room is above 20, so it's
      // renumbered to 30 (prev=20, no next -> prev+10).
      expect(ops).toContainEqual({
        op: 'delete',
        path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10'],
      })
      expect(ops).toContainEqual({
        op: 'set',
        path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '30', 'action'],
        value: 'accept',
      })
      // The delete must be queued before the corresponding set.
      const deleteIndex = ops.findIndex((o) => o.op === 'delete')
      const setIndex = ops.findIndex((o) => o.op === 'set' && o.path.includes('30'))
      expect(deleteIndex).toBeLessThan(setIndex)
    })

    it('does nothing when there is only one rule', async () => {
      server.use(
        http.get('/api/config/tree', () =>
          HttpResponse.json({
            data: { ipv4: { forward: { filter: { rule: { '10': { action: 'accept' } } } } } },
          }),
        ),
      )
      renderDetail('/firewall/rulesets/ipv4/base/forward')
      await screen.findByText('forward')

      expect(screen.getByLabelText('Move rule 10 up')).toBeDisabled()
      expect(screen.getByLabelText('Move rule 10 down')).toBeDisabled()
      // With only one rule, no reordering hint or drag affordance is
      // needed either.
      expect(screen.queryByText(/drag the/i)).not.toBeInTheDocument()
    })
  })

  it('changes the ruleset default-action', async () => {
    const user = userEvent.setup()
    renderDetail('/firewall/rulesets/ipv4/base/forward')
    await screen.findByText('forward')

    await user.selectOptions(screen.getByLabelText(/default action/i), 'accept')

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['firewall', 'ipv4', 'forward', 'filter', 'default-action'],
      value: 'accept',
    })
  })
})
