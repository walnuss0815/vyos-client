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
