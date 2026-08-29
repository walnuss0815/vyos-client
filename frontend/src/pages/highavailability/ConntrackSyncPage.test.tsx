import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ConntrackSyncPage from './ConntrackSyncPage'

const CONNTRACK_SYNC_CONFIG = {
  'accept-protocol': ['tcp'],
  'failover-mechanism': { vrrp: { 'sync-group': 'INTERNAL' } },
  interface: { eth1: { peer: '192.0.2.2' } },
}

const HA_CONFIG = {
  vrrp: { 'sync-group': { INTERNAL: { member: ['OUTSIDE'] } } },
}

function mockConfigTree() {
  server.use(
    http.get('/api/config/tree', ({ request }) => {
      const path = new URL(request.url).searchParams.get('path')
      if (path === 'service,conntrack-sync') {
        return HttpResponse.json({ data: CONNTRACK_SYNC_CONFIG })
      }
      return HttpResponse.json({ data: HA_CONFIG })
    }),
    http.get('/api/high-availability/conntrack-sync/status', () =>
      HttpResponse.json({
        syncInterfaces: ['eth1'],
        failoverMechanism: 'vrrp',
        syncGroup: 'INTERNAL',
        lastTransition: 'no transition yet!',
        expectSyncProtocols: [],
      }),
    ),
  )
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  mockConfigTree()
})

describe('ConntrackSyncPage', () => {
  it('shows an error message when the config fails to load', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<ConntrackSyncPage />)
    expect(await screen.findByText(/failed to load high availability configuration/i)).toBeInTheDocument()
  })

  it('renders settings reflecting the fetched config, with the VRRP sync-group dropdown populated', async () => {
    renderWithProviders(<ConntrackSyncPage />)
    const select = await screen.findByLabelText(/vrrp sync group/i)
    expect(select).toHaveValue('INTERNAL')
    expect(screen.getByRole('option', { name: 'INTERNAL' })).toBeInTheDocument()
  })

  it('renders the sync interfaces list', async () => {
    renderWithProviders(<ConntrackSyncPage />)
    expect(await screen.findByText(/eth1.*peer 192\.0\.2\.2/)).toBeInTheDocument()
  })

  it('adds a new sync interface', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConntrackSyncPage />)
    await screen.findByText(/eth1/)

    await user.click(screen.getByRole('button', { name: '+ Add interface' }))
    await user.type(screen.getByPlaceholderText('eth1'), 'eth2')
    await user.click(screen.getByRole('button', { name: 'Add interface' }))

    const { changes } = usePendingChangesStore.getState()
    expect(
      changes.some((c) => c.op.op === 'set' && c.op.path.join(' ') === 'service conntrack-sync interface eth2'),
    ).toBe(true)
  })

  it('saves a settings change', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ConntrackSyncPage />)
    await screen.findByText(/eth1/)

    const purgeTimeoutInput = screen.getByLabelText(/purge timeout/i)
    await user.clear(purgeTimeoutInput)
    await user.type(purgeTimeoutInput, '120')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toContainEqual(
      expect.objectContaining({
        op: { op: 'set', path: ['service', 'conntrack-sync', 'purge-timeout'], value: '120' },
      }),
    )
  })

  it('shows the live conntrack-sync status panel', async () => {
    renderWithProviders(<ConntrackSyncPage />)
    expect(await screen.findByText('no transition yet!')).toBeInTheDocument()
  })
})
