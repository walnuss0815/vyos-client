import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import VrrpPage from './VrrpPage'

const HA_CONFIG = {
  vrrp: {
    snmp: { trap: {} },
    group: {
      OUTSIDE: {
        interface: 'eth0',
        vrid: '10',
        priority: '100',
        address: { '192.0.2.254/24': {} },
      },
    },
    'sync-group': {
      INTERNAL: { member: ['OUTSIDE'] },
    },
  },
}

function mockConfigTree() {
  server.use(
    http.get('/api/config/tree', ({ request }) => {
      const path = new URL(request.url).searchParams.get('path')
      if (path === 'service,conntrack-sync') {
        return HttpResponse.json({ data: {} })
      }
      return HttpResponse.json({ data: HA_CONFIG })
    }),
    http.get('/api/high-availability/vrrp/status', () => HttpResponse.json({ groups: [] })),
  )
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  mockConfigTree()
})

describe('VrrpPage', () => {
  it('shows an error message when the config fails to load', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<VrrpPage />)
    expect(await screen.findByText(/failed to load high availability configuration/i)).toBeInTheDocument()
  })

  it('renders global settings reflecting the fetched config', async () => {
    renderWithProviders(<VrrpPage />)
    const trap = await screen.findByRole('checkbox', { name: /enable snmp traps/i })
    expect(trap).toBeChecked()
  })

  it('renders the groups list with its virtual address', async () => {
    renderWithProviders(<VrrpPage />)
    expect(await screen.findByText('OUTSIDE')).toBeInTheDocument()
    expect(screen.getByText(/vrid 10/)).toBeInTheDocument()
    expect(screen.getByText('192.0.2.254/24')).toBeInTheDocument()
  })

  it('adds a new VRRP group', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VrrpPage />)
    await screen.findByText('OUTSIDE')

    await user.click(screen.getByRole('button', { name: '+ Add group' }))
    await user.type(screen.getByPlaceholderText('OUTSIDE'), 'INSIDE')
    await user.type(screen.getByPlaceholderText('eth0'), 'eth1')
    await user.click(screen.getByRole('button', { name: 'Add group' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.some((c) => c.op.op === 'set' && c.op.path.join(' ') === 'high-availability vrrp group INSIDE')).toBe(
      true,
    )
  })

  it('also queues a first virtual address when creating a group with its optional fields filled in', async () => {
    // Regression test: a group's virtual addresses used to only be
    // configurable AFTER the group already existed -
    // VrrpAddressesSection only ever operates on an already-fetched
    // group.
    const user = userEvent.setup()
    renderWithProviders(<VrrpPage />)
    await screen.findByText('OUTSIDE')

    await user.click(screen.getByRole('button', { name: '+ Add group' }))
    await user.type(screen.getByPlaceholderText('OUTSIDE'), 'INSIDE')
    await user.type(screen.getByPlaceholderText('eth0'), 'eth1')
    await user.type(screen.getByPlaceholderText('192.0.2.254/24'), '198.51.100.254/24')
    await user.click(screen.getByRole('button', { name: 'Add group' }))

    const { changes } = usePendingChangesStore.getState()
    const ops = changes.map((c) => c.op)
    expect(ops).toContainEqual({
      op: 'set',
      path: ['high-availability', 'vrrp', 'group', 'INSIDE', 'address', '198.51.100.254/24'],
    })
  })

  it('deletes a group', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VrrpPage />)
    await screen.findByText('OUTSIDE')

    // Both the group list and the sync-group list below it have their
    // own "Delete" button - the group's is the first one in DOM order.
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    const { changes } = usePendingChangesStore.getState()
    expect(changes).toContainEqual(
      expect.objectContaining({ op: { op: 'delete', path: ['high-availability', 'vrrp', 'group', 'OUTSIDE'] } }),
    )
  })

  it('renders the sync-groups list', async () => {
    renderWithProviders(<VrrpPage />)
    expect(await screen.findByText('INTERNAL')).toBeInTheDocument()
    expect(screen.getByText(/members: OUTSIDE/)).toBeInTheDocument()
  })

  it('shows the live VRRP status panel', async () => {
    server.use(
      http.get('/api/high-availability/vrrp/status', () =>
        HttpResponse.json({
          groups: [{ name: 'OUTSIDE', interface: 'eth0', vrid: '10', state: 'MASTER', priority: '100', lastTransition: '2s' }],
        }),
      ),
    )
    renderWithProviders(<VrrpPage />)
    expect(await screen.findByText('MASTER')).toBeInTheDocument()
  })
})
