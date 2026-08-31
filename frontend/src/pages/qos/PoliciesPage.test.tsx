import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import PoliciesPage from './PoliciesPage'

const QOS_CONFIG = {
  interface: { eth0: { egress: 'WAN-OUT' } },
  policy: {
    shaper: { 'WAN-OUT': { bandwidth: '100mbit', class: { '2': { bandwidth: '50mbit' } } } },
    'shaper-hfsc': { HFSC1: {} },
    limiter: { 'IN-LIMIT': {} },
    'priority-queue': { PQ1: {} },
    'round-robin': { RR1: {} },
    cake: { CAKE1: { bandwidth: '1gbit' } },
    'fq-codel': { FQC1: {} },
    'rate-control': { RC1: { bandwidth: '10mbit' } },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  server.use(
    http.get('/api/config/tree', () => HttpResponse.json({ data: QOS_CONFIG })),
    http.get('/api/qos/shaper-status', () => HttpResponse.json({ interface: 'eth0', policyName: 'WAN-OUT', classes: [] })),
  )
})

describe('PoliciesPage', () => {
  it('shows an error message when the config fails to load', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<PoliciesPage />)
    expect(await screen.findByText(/failed to load qos configuration/i)).toBeInTheDocument()
  })

  it('renders one entry per configured policy type', async () => {
    renderWithProviders(<PoliciesPage />)
    expect(await screen.findByText('WAN-OUT')).toBeInTheDocument()
    expect(screen.getByText('HFSC1')).toBeInTheDocument()
    expect(screen.getByText('IN-LIMIT')).toBeInTheDocument()
    expect(screen.getByText('PQ1')).toBeInTheDocument()
    expect(screen.getByText('RR1')).toBeInTheDocument()
    expect(screen.getByText('CAKE1')).toBeInTheDocument()
    expect(screen.getByText('FQC1')).toBeInTheDocument()
    expect(screen.getByText('RC1')).toBeInTheDocument()
  })

  it('adds a new cake policy', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('CAKE1')

    const cakeHeading = screen.getByText('CAKE')
    const cakeSection = cakeHeading.closest('.mb-8') as HTMLElement
    await user.click(within(cakeSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(cakeSection).getByRole('textbox'), 'CAKE2')
    await user.click(within(cakeSection).getByRole('button', { name: 'Add policy' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.some((c) => c.op.op === 'set' && c.op.path.join(' ') === 'qos policy cake CAKE2')).toBe(true)
  })

  it('also queues a first class and default class when creating a shaper policy with optional fields filled in', async () => {
    // Regression test: a shaper policy's classes and default class
    // used to only be configurable AFTER the policy already existed -
    // ShaperClassList/ShaperDefaultClassPanel only ever operate on an
    // already-fetched policy.
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('WAN-OUT')

    const shaperHeading = screen.getByText('Shaper (HTB)')
    const shaperSection = shaperHeading.closest('.mb-8') as HTMLElement
    await user.click(within(shaperSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(shaperSection).getByPlaceholderText('WAN-OUT'), 'LAN-OUT')
    await user.type(within(shaperSection).getByPlaceholderText('class ID (2-4095)'), '2')
    const bandwidthInputs = within(shaperSection).getAllByPlaceholderText('bandwidth')
    await user.type(bandwidthInputs[0], '10mbit')
    await user.type(bandwidthInputs[1], '5mbit')
    await user.click(within(shaperSection).getByRole('button', { name: 'Add policy' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'shaper', 'LAN-OUT'] })
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'shaper', 'LAN-OUT', 'class', '2'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'shaper', 'LAN-OUT', 'class', '2', 'bandwidth'],
      value: '10mbit',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'shaper', 'LAN-OUT', 'default', 'bandwidth'],
      value: '5mbit',
    })
  })

  it('also queues a first class when creating a priority-queue policy with its optional field filled in', async () => {
    // Regression test: a simple-classful (priority-queue/round-robin)
    // policy's classes used to only be configurable AFTER the policy
    // already existed - ClassList only ever operates on an
    // already-fetched policy.
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('PQ1')

    const pqHeading = screen.getByText('Priority Queue')
    const pqSection = pqHeading.closest('.mb-8') as HTMLElement
    await user.click(within(pqSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(pqSection).getByLabelText('Name'), 'PQ2')
    await user.type(within(pqSection).getByPlaceholderText('priority (1-7)'), '3')
    await user.click(within(pqSection).getByRole('button', { name: 'Add policy' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'priority-queue', 'PQ2'] })
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'priority-queue', 'PQ2', 'class', '3'] })
  })

  it('does not leak a previous priority-queue policy\'s first-class draft into the next one', async () => {
    // Regression test: same stale-draft bug as the shaper test above,
    // for the shared simple-classful component (priority-queue and
    // round-robin both use it).
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('PQ1')

    const pqHeading = screen.getByText('Priority Queue')
    const pqSection = pqHeading.closest('.mb-8') as HTMLElement

    await user.click(within(pqSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(pqSection).getByLabelText('Name'), 'PQ2')
    await user.type(within(pqSection).getByPlaceholderText('priority (1-7)'), '3')
    await user.click(within(pqSection).getByRole('button', { name: 'Add policy' }))

    usePendingChangesStore.setState({ changes: [] })

    await user.click(within(pqSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(pqSection).getByLabelText('Name'), 'PQ3')
    expect(within(pqSection).getByPlaceholderText('priority (1-7)')).toHaveValue('')
    await user.click(within(pqSection).getByRole('button', { name: 'Add policy' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['qos', 'policy', 'priority-queue', 'PQ3'] })
  })

  it('also queues a first class and default class when creating a shaper-hfsc policy with optional fields filled in', async () => {
    // Regression test: same bug as the shaper case above, for the
    // shaper-hfsc policy type - HfscClassList/HfscDefaultClassPanel
    // only ever operate on an already-fetched policy.
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('HFSC1')

    const hfscHeading = screen.getByText('Shaper HFSC')
    const hfscSection = hfscHeading.closest('.mb-8') as HTMLElement
    await user.click(within(hfscSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(hfscSection).getByPlaceholderText('VOICE-SHAPER'), 'VOICE2')
    await user.type(within(hfscSection).getByPlaceholderText('class ID (1-4095)'), '1')
    const m2Inputs = within(hfscSection).getAllByPlaceholderText('linkshare rate (m2)')
    await user.type(m2Inputs[0], '2mbit')
    await user.type(m2Inputs[1], '1mbit')
    await user.click(within(hfscSection).getByRole('button', { name: 'Add policy' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'shaper-hfsc', 'VOICE2'] })
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'shaper-hfsc', 'VOICE2', 'class', '1'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'shaper-hfsc', 'VOICE2', 'class', '1', 'linkshare', 'm2'],
      value: '2mbit',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'shaper-hfsc', 'VOICE2', 'default', 'linkshare', 'm2'],
      value: '1mbit',
    })
  })

  it('does not leak a previous shaper-hfsc policy\'s first-class/default-class draft into the next one', async () => {
    // Regression test: same stale-draft bug as the shaper test above.
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('HFSC1')

    const hfscHeading = screen.getByText('Shaper HFSC')
    const hfscSection = hfscHeading.closest('.mb-8') as HTMLElement

    await user.click(within(hfscSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(hfscSection).getByPlaceholderText('VOICE-SHAPER'), 'VOICE2')
    await user.type(within(hfscSection).getByPlaceholderText('class ID (1-4095)'), '1')
    const m2Inputs = within(hfscSection).getAllByPlaceholderText('linkshare rate (m2)')
    await user.type(m2Inputs[0], '2mbit')
    await user.type(m2Inputs[1], '1mbit')
    await user.click(within(hfscSection).getByRole('button', { name: 'Add policy' }))

    usePendingChangesStore.setState({ changes: [] })

    await user.click(within(hfscSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(hfscSection).getByPlaceholderText('VOICE-SHAPER'), 'VOICE3')
    expect(within(hfscSection).getByPlaceholderText('class ID (1-4095)')).toHaveValue('')
    for (const input of within(hfscSection).getAllByPlaceholderText('linkshare rate (m2)')) {
      expect(input).toHaveValue('')
    }
    await user.click(within(hfscSection).getByRole('button', { name: 'Add policy' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['qos', 'policy', 'shaper-hfsc', 'VOICE3'] })
  })

  it('also queues a first class and default class when creating a limiter policy with optional fields filled in', async () => {
    // Regression test: same bug as the shaper case above, for the
    // limiter policy type - LimiterClassList/LimiterDefaultClassPanel
    // only ever operate on an already-fetched policy.
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('IN-LIMIT')

    const limiterHeading = screen.getByText('Limiter (ingress policing)')
    const limiterSection = limiterHeading.closest('.mb-8') as HTMLElement
    await user.click(within(limiterSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(limiterSection).getByPlaceholderText('IN-LIMIT'), 'IN-LIMIT2')
    await user.type(within(limiterSection).getByPlaceholderText('class ID (1-4090)'), '1')
    const bandwidthInputs = within(limiterSection).getAllByPlaceholderText('bandwidth')
    await user.type(bandwidthInputs[0], '20mbit')
    await user.type(bandwidthInputs[1], '10mbit')
    await user.click(within(limiterSection).getByRole('button', { name: 'Add policy' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'limiter', 'IN-LIMIT2'] })
    expect(ops).toContainEqual({ op: 'set', path: ['qos', 'policy', 'limiter', 'IN-LIMIT2', 'class', '1'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'limiter', 'IN-LIMIT2', 'class', '1', 'bandwidth'],
      value: '20mbit',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['qos', 'policy', 'limiter', 'IN-LIMIT2', 'default', 'bandwidth'],
      value: '10mbit',
    })
  })

  it('does not leak a previous shaper policy\'s first-class/default-class draft into the next one', async () => {
    // Regression test: firstClassId/firstClassBandwidth/
    // firstClassCeiling/defaultBandwidth/defaultCeiling used to live
    // in this long-lived list component and were never reset after a
    // successful "Add policy" (or on Cancel) - so creating a SECOND
    // policy right after would silently reuse the first policy's
    // leftover draft values.
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('WAN-OUT')

    const shaperHeading = screen.getByText('Shaper (HTB)')
    const shaperSection = shaperHeading.closest('.mb-8') as HTMLElement

    // First policy: fill in the optional first-class/default fields.
    await user.click(within(shaperSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(shaperSection).getByPlaceholderText('WAN-OUT'), 'LAN-OUT')
    await user.type(within(shaperSection).getByPlaceholderText('class ID (2-4095)'), '2')
    let bandwidthInputs = within(shaperSection).getAllByPlaceholderText('bandwidth')
    await user.type(bandwidthInputs[0], '10mbit')
    await user.type(bandwidthInputs[1], '5mbit')
    await user.click(within(shaperSection).getByRole('button', { name: 'Add policy' }))

    usePendingChangesStore.setState({ changes: [] })

    // Second policy: only a name, nothing else - the draft fields
    // must be blank, not still holding the first policy's values.
    await user.click(within(shaperSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(shaperSection).getByPlaceholderText('WAN-OUT'), 'LAN-OUT-2')
    expect(within(shaperSection).getByPlaceholderText('class ID (2-4095)')).toHaveValue('')
    expect(within(shaperSection).getAllByPlaceholderText('bandwidth')[0]).toHaveValue('')
    await user.click(within(shaperSection).getByRole('button', { name: 'Add policy' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['qos', 'policy', 'shaper', 'LAN-OUT-2'] })
  })

  it('does not leak a previous limiter policy\'s first-class/default-class draft into the next one', async () => {
    // Regression test: same stale-draft bug as the shaper test above.
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('IN-LIMIT')

    const limiterHeading = screen.getByText('Limiter (ingress policing)')
    const limiterSection = limiterHeading.closest('.mb-8') as HTMLElement

    await user.click(within(limiterSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(limiterSection).getByPlaceholderText('IN-LIMIT'), 'IN-LIMIT2')
    await user.type(within(limiterSection).getByPlaceholderText('class ID (1-4090)'), '1')
    let bandwidthInputs = within(limiterSection).getAllByPlaceholderText('bandwidth')
    await user.type(bandwidthInputs[0], '20mbit')
    await user.type(bandwidthInputs[1], '10mbit')
    await user.click(within(limiterSection).getByRole('button', { name: 'Add policy' }))

    usePendingChangesStore.setState({ changes: [] })

    await user.click(within(limiterSection).getByRole('button', { name: '+ Add policy' }))
    await user.type(within(limiterSection).getByPlaceholderText('IN-LIMIT'), 'IN-LIMIT3')
    expect(within(limiterSection).getByPlaceholderText('class ID (1-4090)')).toHaveValue('')
    bandwidthInputs = within(limiterSection).getAllByPlaceholderText('bandwidth')
    expect(bandwidthInputs[0]).toHaveValue('')
    expect(bandwidthInputs[1]).toHaveValue('')
    await user.click(within(limiterSection).getByRole('button', { name: 'Add policy' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['qos', 'policy', 'limiter', 'IN-LIMIT3'] })
  })

  it('deletes a shaper policy', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('WAN-OUT')

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(deleteButtons[0])

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toContainEqual(
      expect.objectContaining({ op: { op: 'delete', path: ['qos', 'policy', 'shaper', 'WAN-OUT'] } }),
    )
  })

  it('shows the shaper status panel with the bound interface selectable', async () => {
    renderWithProviders(<PoliciesPage />)
    await screen.findByText('WAN-OUT')
    expect(screen.getByRole('option', { name: 'eth0' })).toBeInTheDocument()
  })
})
