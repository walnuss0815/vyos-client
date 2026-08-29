import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import RuleForm from './RuleForm'

const ref = { id: 'forward', kind: 'base' as const, family: 'ipv4' as const }

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

describe('RuleForm', () => {
  it('suggests the next rule number rounded up to a multiple of 10', () => {
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={['10', '25']} onDone={() => {}} />)
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
  })

  it('suggests 10 for the first rule in an empty ruleset', () => {
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => {}} />)
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
  })

  // A Math.max(...spread) implementation risks hitting JS engine
  // argument-count limits for a pathologically large ruleset (VyOS
  // technically allows rule numbers up to 999999); a reduce-based max
  // has no such limit.
  it('suggests the next number correctly for a very large ruleset', () => {
    const existingNumbers = Array.from({ length: 5000 }, (_, i) => String((i + 1) * 10))
    renderWithProviders(
      <RuleForm rulesetRef={ref} existingNumbers={existingNumbers} onDone={() => {}} />,
    )
    expect(screen.getByDisplayValue('50010')).toBeInTheDocument()
  })

  it('disables submit and shows an error for a duplicate rule number', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={['10']} onDone={() => {}} />)

    const numberInput = screen.getByLabelText(/rule number/i)
    await user.clear(numberInput)
    await user.type(numberInput, '10')
    await user.selectOptions(screen.getByLabelText(/^action/i), 'accept')

    expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue new rule/i })).toBeDisabled()
  })

  it('disables submit until an action is chosen', async () => {
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => {}} />)
    expect(screen.getByRole('button', { name: /queue new rule/i })).toBeDisabled()
  })

  it('reveals the jump-target field only when action is "jump"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => {}} />)

    expect(screen.queryByLabelText(/jump target/i)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/^action/i), 'jump')
    expect(screen.getByLabelText(/jump target/i)).toBeInTheDocument()
  })

  it('switches between Basic, Match, and Advanced tabs', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => {}} />)

    expect(screen.getByLabelText(/protocol/i)).toBeInTheDocument()
    expect(screen.queryByText('Source')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'match' }))
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getByText('Destination')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'advanced' }))
    expect(screen.getByLabelText(/inbound interface/i)).toBeInTheDocument()
  })

  it('only shows MAC address matching for source, not destination', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'match' }))

    expect(screen.getAllByLabelText(/mac address/i)).toHaveLength(1)
  })

  // Regression test: FirewallMatch (firewallTypes.ts) and the diff
  // logic in firewallRuleForm.ts both model macGroup/domainGroup for
  // both source and destination - VyOS itself allows both as match
  // criteria - but MatchFields didn't render inputs for either,
  // meaning a user couldn't set them via this form at all (only via
  // the Config Tree fallback), and the rule summary table couldn't
  // show them either, even though nothing about the type system or
  // diff logic actually prevented it.
  it('shows MAC group matching for source only, matching MAC address', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'match' }))

    expect(screen.getAllByLabelText(/mac group/i)).toHaveLength(1)
  })

  it('shows domain group matching for both source and destination', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'match' }))

    expect(screen.getAllByLabelText(/domain group/i)).toHaveLength(2)
  })

  it('queues ops for source MAC group and destination domain group', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => {}} />)
    await user.selectOptions(screen.getByLabelText(/^action/i), 'accept')
    await user.click(screen.getByRole('button', { name: 'match' }))

    await user.type(screen.getByLabelText(/mac group/i), 'KNOWN-DEVICES')
    const [, destinationDomainGroup] = screen.getAllByLabelText(/domain group/i)
    await user.type(destinationDomainGroup, 'BLOCKED-ADS')
    await user.click(screen.getByRole('button', { name: /queue new rule/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: {
            op: 'set',
            path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'source', 'group', 'mac-group'],
            value: 'KNOWN-DEVICES',
          },
        }),
        expect.objectContaining({
          op: {
            op: 'set',
            path: [
              'firewall',
              'ipv4',
              'forward',
              'filter',
              'rule',
              '10',
              'destination',
              'group',
              'domain-group',
            ],
            value: 'BLOCKED-ADS',
          },
        }),
      ]),
    )
  })

  it('queues ops for fields filled across multiple tabs, then calls onDone', async () => {
    const user = userEvent.setup()
    let done = false
    renderWithProviders(
      <RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => (done = true)} />,
    )

    await user.selectOptions(screen.getByLabelText(/^action/i), 'accept')
    await user.click(screen.getByRole('button', { name: 'match' }))
    // Source's "Address" field renders before Destination's - both
    // share the same label text, so index into the pair.
    const [, destinationAddress] = screen.getAllByLabelText(/^address$/i)
    await user.type(destinationAddress, '10.0.0.5')
    await user.click(screen.getByRole('button', { name: /queue new rule/i }))

    expect(done).toBe(true)
    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: { op: 'set', path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'action'], value: 'accept' },
        }),
        expect.objectContaining({
          op: {
            op: 'set',
            path: ['firewall', 'ipv4', 'forward', 'filter', 'rule', '10', 'destination', 'address'],
            value: '10.0.0.5',
          },
        }),
      ]),
    )
  })

  it('calls onDone when Cancel is clicked without queuing anything', async () => {
    const user = userEvent.setup()
    let done = false
    renderWithProviders(<RuleForm rulesetRef={ref} existingNumbers={[]} onDone={() => (done = true)} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(done).toBe(true)
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })
})
