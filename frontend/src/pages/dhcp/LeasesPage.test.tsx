import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useRefreshSettingsStore } from '../../store/refreshSettings'
import LeasesPage from './LeasesPage'

beforeEach(() => {
  localStorage.clear()
  useRefreshSettingsStore.setState({ enabled: true, intervalSeconds: 30 })
})

const makeLease = (overrides: Record<string, unknown>) => ({
  ipAddress: '192.168.1.134',
  macAddress: '00:50:79:66:68:09',
  state: 'active',
  leaseStart: '2023/11/29 09:51:05',
  leaseEnd: '2023/11/29 10:21:05',
  remaining: '0:24:10',
  pool: 'LAN',
  hostname: 'VPCS1',
  origin: 'local',
  subnet: '192.168.1.0/24',
  ...overrides,
})

describe('LeasesPage', () => {
  it('renders the leases table with the refresh control', async () => {
    server.use(http.get('/api/dhcp/leases', () => HttpResponse.json({ leases: [makeLease({})] })))
    renderWithProviders(<LeasesPage />)

    expect(await screen.findByText('192.168.1.134')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /auto-refresh/i })).toBeInTheDocument()
  })

  it('shows an error message when the leases query fails', async () => {
    server.use(
      http.get('/api/dhcp/leases', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })),
    )
    renderWithProviders(<LeasesPage />)

    expect(await screen.findByText(/failed to load dhcp leases/i)).toBeInTheDocument()
  })

  it('groups leases into one table per pool, sorted alphabetically, with per-pool counts', async () => {
    server.use(
      http.get('/api/dhcp/leases', () =>
        HttpResponse.json({
          leases: [
            makeLease({ pool: 'WIFI', ipAddress: '192.168.2.1', hostname: 'phone' }),
            makeLease({ pool: 'LAN', ipAddress: '192.168.1.1', hostname: 'desktop' }),
            makeLease({ pool: 'LAN', ipAddress: '192.168.1.2', hostname: 'laptop' }),
          ],
        }),
      ),
    )
    renderWithProviders(<LeasesPage />)

    expect(await screen.findByText('192.168.1.1')).toBeInTheDocument()

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['LAN (2)', 'WIFI (1)'])

    // Grouped tables don't repeat the pool name as a column.
    expect(screen.queryByRole('columnheader', { name: 'Pool' })).not.toBeInTheDocument()
  })

  it('groups leases with no resolved pool under "Unknown"', async () => {
    server.use(
      http.get('/api/dhcp/leases', () =>
        HttpResponse.json({ leases: [makeLease({ pool: '', hostname: 'mystery' })] }),
      ),
    )
    renderWithProviders(<LeasesPage />)

    expect(await screen.findByText('mystery')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Unknown (1)' })).toBeInTheDocument()
  })

  it('shows the empty-state message when there are no leases at all', async () => {
    server.use(http.get('/api/dhcp/leases', () => HttpResponse.json({ leases: [] })))
    renderWithProviders(<LeasesPage />)

    expect(await screen.findByText(/no active leases/i)).toBeInTheDocument()
  })
})
