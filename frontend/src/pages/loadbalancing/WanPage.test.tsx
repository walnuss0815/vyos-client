import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import WanPage from './WanPage'

const WAN_CONFIG = {
  wan: {
    'flush-connections': {},
    'interface-health': {
      eth0: {
        nexthop: '192.0.2.1',
        'failure-count': '1',
        'success-count': '1',
        test: { '0': { type: 'ping', target: '9.9.9.9' } },
      },
    },
    rule: {
      '10': {
        description: 'primary',
        failover: {},
        interface: { eth0: { weight: '1' } },
      },
    },
  },
  haproxy: {},
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  server.use(
    http.get('/api/config/tree', () => HttpResponse.json({ data: WAN_CONFIG })),
    http.get('/api/load-balancing/wan/status', () => HttpResponse.json({ interfaces: [] })),
  )
})

describe('WanPage', () => {
  it('shows an error message when the config fails to load', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<WanPage />)
    expect(await screen.findByText(/failed to load load-balancing configuration/i)).toBeInTheDocument()
  })

  it('renders global toggles reflecting the fetched config', async () => {
    renderWithProviders(<WanPage />)
    const flush = await screen.findByRole('checkbox', { name: /flush connections/i })
    expect(flush).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /load-balance locally-originated traffic/i })).not.toBeChecked()
  })

  it('queues a global toggle change', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WanPage />)
    const toggle = await screen.findByRole('checkbox', { name: /load-balance locally-originated traffic/i })
    await user.click(toggle)

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['load-balancing', 'wan', 'enable-local-traffic'] })
  })

  it('renders the interface health list with its nested test', async () => {
    renderWithProviders(<WanPage />)
    expect(await screen.findByText('eth0')).toBeInTheDocument()
    expect(screen.getByText(/nexthop 192\.0\.2\.1/)).toBeInTheDocument()
    expect(screen.getByText(/#0 ping -> 9\.9\.9\.9/)).toBeInTheDocument()
  })

  it('adds a new interface health check', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WanPage />)
    await screen.findByText('eth0')

    // Both the interface-health list and each rule's egress-interfaces
    // section have a "+ Add interface" button - the health list's is
    // the first one in DOM order.
    await user.click(screen.getAllByRole('button', { name: '+ Add interface' })[0])
    await user.type(screen.getByPlaceholderText('eth0'), 'eth1')
    await user.type(screen.getByPlaceholderText('192.0.2.1 or dhcp'), '203.0.113.1')
    await user.click(screen.getByRole('button', { name: 'Add interface' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.some((c) => c.op.op === 'set' && c.op.path.join(' ') === 'load-balancing wan interface-health eth1')).toBe(
      true,
    )
    expect(
      changes.some(
        (c) =>
          c.op.op === 'set' &&
          c.op.path.join(' ') === 'load-balancing wan interface-health eth1 nexthop' &&
          c.op.value === '203.0.113.1',
      ),
    ).toBe(true)
  })

  it('also queues a first health test for a new interface when its optional fields are filled in', async () => {
    // Regression test: an interface-health entry's tests used to only
    // be addable AFTER the entry already existed -
    // WanHealthTestsSection only ever operates on an already-fetched
    // entry.
    const user = userEvent.setup()
    renderWithProviders(<WanPage />)
    await screen.findByText('eth0')

    await user.click(screen.getAllByRole('button', { name: '+ Add interface' })[0])
    await user.type(screen.getByPlaceholderText('eth0'), 'eth1')
    await user.type(screen.getByPlaceholderText('target address'), '9.9.9.9')
    await user.click(screen.getByRole('button', { name: 'Add interface' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'wan', 'interface-health', 'eth1', 'test', '0'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'interface-health', 'eth1', 'test', '0', 'type'],
      value: 'ping',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'interface-health', 'eth1', 'test', '0', 'target'],
      value: '9.9.9.9',
    })
  })

  it('also queues a first egress interface for a new rule when its optional fields are filled in', async () => {
    // Regression test: a rule's egress interfaces used to only be
    // addable AFTER the rule already existed - WanRuleInterfacesSection
    // only ever operates on an already-fetched rule.
    const user = userEvent.setup()
    renderWithProviders(<WanPage />)
    await screen.findByText(/#10/)

    await user.click(screen.getByRole('button', { name: '+ Add rule' }))
    await user.type(screen.getByPlaceholderText('eth0'), 'eth2')
    await user.type(screen.getByPlaceholderText('weight (default 1)'), '2')
    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['load-balancing', 'wan', 'rule', '20', 'interface', 'eth2'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['load-balancing', 'wan', 'rule', '20', 'interface', 'eth2', 'weight'],
      value: '2',
    })
  })

  it('renders the rules list and queues a rule deletion', async () => {
    const user = userEvent.setup()
    renderWithProviders(<WanPage />)
    expect(await screen.findByText(/#10/)).toBeInTheDocument()
    expect(screen.getByText('primary')).toBeInTheDocument()

    // Both the interface-health list and the rules list have their
    // own "Delete" button per row - the rule's is the second one in
    // DOM order (interface-health list renders first).
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(deleteButtons[deleteButtons.length - 1])
    const { changes } = usePendingChangesStore.getState()
    expect(changes).toContainEqual(
      expect.objectContaining({ op: { op: 'delete', path: ['load-balancing', 'wan', 'rule', '10'] } }),
    )
  })

  it('shows the live WAN status panel', async () => {
    server.use(
      http.get('/api/load-balancing/wan/status', () =>
        HttpResponse.json({
          interfaces: [{ interface: 'eth0', active: true, lastStatusChange: '2024-01-01', lastSuccess: '', lastFailure: '', failures: 0 }],
        }),
      ),
    )
    renderWithProviders(<WanPage />)
    expect(await screen.findByText('active')).toBeInTheDocument()
  })
})
