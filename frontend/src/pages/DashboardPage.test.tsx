import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { renderWithProviders } from '../test/testUtils'
import DashboardPage from './DashboardPage'

describe('DashboardPage', () => {
  it('shows a loading placeholder before system info loads', () => {
    server.use(
      http.get('/api/system/info', () => new Promise(() => {})),
      http.get('/api/system/resources', () => new Promise(() => {})),
    )
    renderWithProviders(<DashboardPage />)
    // Hostname + VyOS version + Uptime + CPU + Memory + Storage cards.
    expect(screen.getAllByText('…')).toHaveLength(6)
  })

  it('renders the hostname and version once loaded', async () => {
    server.use(
      http.get('/api/system/info', () =>
        HttpResponse.json({ hostname: 'test-router', version: '2026.02-rolling' }),
      ),
    )
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('test-router')).toBeInTheDocument()
    expect(screen.getByText('2026.02-rolling')).toBeInTheDocument()
  })

  it('shows the login banner below the "Dashboard" title when VyOS has one configured', async () => {
    server.use(
      http.get('/api/system/info', () =>
        HttpResponse.json({
          hostname: 'test-router',
          version: '2026.02-rolling',
          loginBanner: 'Authorized access only.\nAll activity is logged.',
        }),
      ),
    )
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText(/Authorized access only\./)).toBeInTheDocument()
    expect(screen.getByText(/All activity is logged\./)).toBeInTheDocument()

    // DOM_POSITION_FOLLOWING (4) means the title precedes the banner.
    const title = screen.getByRole('heading', { name: 'Dashboard' })
    const banner = screen.getByText(/Authorized access only\./)
    expect(title.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not render a login banner element when VyOS has none configured', async () => {
    server.use(
      http.get('/api/system/info', () =>
        HttpResponse.json({ hostname: 'test-router', version: '2026.02-rolling', loginBanner: '' }),
      ),
    )
    renderWithProviders(<DashboardPage />)
    // Wait for the hostname to load first, so we know the query has
    // settled before asserting on the absence of the banner.
    expect(await screen.findByText('test-router')).toBeInTheDocument()
    expect(screen.queryByText(/authorized access only/i)).not.toBeInTheDocument()
  })

  it('shows an error state when the system info query fails', async () => {
    server.use(
      http.get('/api/system/info', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })),
    )
    renderWithProviders(<DashboardPage />)
    expect(await screen.findAllByText(/unable to load/i)).toHaveLength(2)
  })

  it('renders uptime, CPU, memory, and storage once loaded', async () => {
    server.use(
      http.get('/api/system/resources', () =>
        HttpResponse.json({
          uptime: { uptime: '3w 2d 5h 12m 45s', load1: 12.3, load5: 8.7, load15: 5.2 },
          cpu: { cores: 8, model: 'AMD Ryzen 7' },
          memory: { totalBytes: 1024 ** 3 * 16, freeBytes: 1024 ** 3 * 10, usedBytes: 1024 ** 3 * 6 },
          storage: {
            filesystem: '/dev/sda1',
            sizeBytes: 1024 ** 3 * 100,
            usedBytes: 1024 ** 3 * 25,
            availBytes: 1024 ** 3 * 75,
          },
        }),
      ),
    )
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText('3w 2d 5h 12m 45s')).toBeInTheDocument()
    expect(screen.getByText('Load 12% / 9% / 5%')).toBeInTheDocument()
    expect(screen.getByText('8 cores')).toBeInTheDocument()
    expect(screen.getByText('AMD Ryzen 7')).toBeInTheDocument()
    expect(screen.getByText('6.00 GB / 16.00 GB')).toBeInTheDocument()
    expect(screen.getByText('38% used')).toBeInTheDocument() // memory: 6/16
    expect(screen.getByText('25.00 GB / 100.00 GB')).toBeInTheDocument()
    expect(screen.getByText('25% used')).toBeInTheDocument() // storage: 25/100
  })

  it('shows "Unavailable" for storage when VyOS reports it as such, without erroring the other cards', async () => {
    server.use(
      http.get('/api/system/resources', () =>
        HttpResponse.json({
          uptime: { uptime: '5m 12s', load1: 0, load5: 0, load15: 0 },
          cpu: { cores: 2 },
          memory: { totalBytes: 1024 ** 3, freeBytes: 1024 ** 3 / 2, usedBytes: 1024 ** 3 / 2 },
        }),
      ),
    )
    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText('5m 12s')).toBeInTheDocument()
  })

  it('shows an error state when the resources query fails', async () => {
    server.use(
      http.get('/api/system/resources', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })),
    )
    renderWithProviders(<DashboardPage />)
    // Uptime + CPU + Memory + Storage cards.
    expect(await screen.findAllByText(/unable to load/i)).toHaveLength(4)
  })

  it('shows an interfaces preview limited to the first 10, with a count and a link to the full page', async () => {
    const interfaces = Array.from({ length: 15 }, (_, i) => ({
      name: `eth${i}`,
      mac: '52:54:00:00:00:00',
      mtu: 1500,
      operState: 'up',
      adminState: 'up',
      addresses: [],
    }))
    server.use(http.get('/api/interfaces', () => HttpResponse.json({ interfaces })))
    renderWithProviders(<DashboardPage />)

    // Scoped to the Interfaces section specifically - the new
    // Throughput chart's interface picker (a <select>) also lists
    // every interface's name as an <option>, so an unscoped query
    // would find each one twice. The "Interfaces" heading itself is
    // static markup present from the first render, so it's found
    // synchronously; findByText('eth0') within it is what actually
    // waits for the interfaces query to resolve.
    const interfacesSection = screen.getByText('Interfaces').closest('section')
    expect(interfacesSection).not.toBeNull()
    const section = within(interfacesSection as HTMLElement)

    expect(await section.findByText('eth0')).toBeInTheDocument()
    expect(section.getByText('eth9')).toBeInTheDocument()
    expect(section.queryByText('eth10')).not.toBeInTheDocument()
    expect(section.getByText('(15)')).toBeInTheDocument()
    expect(section.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/interfaces')
  })

  it('limits the interfaces preview to physical and VLAN interfaces, excluding virtual-only ones', async () => {
    const makeInterface = (name: string) => ({
      name,
      mac: '52:54:00:00:00:00',
      mtu: 1500,
      operState: 'up',
      adminState: 'up',
      addresses: [],
    })
    const interfaces = [
      makeInterface('eth0'),
      makeInterface('eth0.10'), // VLAN on a physical parent
      makeInterface('wlan0'),
      makeInterface('bond0'), // virtual, no physical/VLAN interface underneath
      makeInterface('br0'),
      makeInterface('wg0'),
    ]
    server.use(http.get('/api/interfaces', () => HttpResponse.json({ interfaces })))
    renderWithProviders(<DashboardPage />)

    // Scoped for the same reason as the test above - eth0/eth0.10/
    // wlan0 are also physical/VLAN interfaces, so they show up again
    // as <option>s in the Throughput chart's interface picker.
    const interfacesSection = screen.getByText('Interfaces').closest('section')
    const section = within(interfacesSection as HTMLElement)

    expect(await section.findByText('eth0')).toBeInTheDocument()
    expect(section.getByText('eth0.10')).toBeInTheDocument()
    expect(section.getByText('wlan0')).toBeInTheDocument()
    expect(section.queryByText('bond0')).not.toBeInTheDocument()
    expect(section.queryByText('br0')).not.toBeInTheDocument()
    expect(section.queryByText('wg0')).not.toBeInTheDocument()
    expect(section.getByText('(3)')).toBeInTheDocument()
  })

  it('shows separate IPv4/IPv6 route sections with every route (no preview cutoff), each with a link to the full page', async () => {
    const makeRoutes = (count: number, prefix: string) =>
      Array.from({ length: count }, (_, i) => ({
        prefix: `${prefix}${i}`,
        protocol: 'static',
        selected: true,
        distance: 1,
        metric: 0,
        nexthops: [],
      }))
    server.use(
      http.get('/api/routes', () =>
        HttpResponse.json({
          ipv4: makeRoutes(12, '10.0.0.0/24-'),
          ipv6: makeRoutes(3, '2001:db8::/64-'),
        }),
      ),
    )
    renderWithProviders(<DashboardPage />)
    await screen.findByText('10.0.0.0/24-0')

    const ipv4Section = within(screen.getByText('IPv4 Routing').closest('section') as HTMLElement)
    expect(ipv4Section.getByText('(12)')).toBeInTheDocument()
    expect(ipv4Section.getByText('10.0.0.0/24-0')).toBeInTheDocument()
    // Unlike the interfaces preview, routes are not cut off - all 12
    // IPv4 routes render, including the 11th (index 10).
    expect(ipv4Section.getByText('10.0.0.0/24-10')).toBeInTheDocument()
    expect(ipv4Section.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/routes')

    const ipv6Section = within(screen.getByText('IPv6 Routing').closest('section') as HTMLElement)
    expect(ipv6Section.getByText('(3)')).toBeInTheDocument()
  })

  it('groups CPU and Memory into their own "Resource usage" section, separate from Hostname/Version/Uptime/Storage', async () => {
    server.use(
      http.get('/api/system/resources', () =>
        HttpResponse.json({
          uptime: { uptime: '3w 2d 5h 12m 45s', load1: 12.3, load5: 8.7, load15: 5.2 },
          cpu: { cores: 8, model: 'AMD Ryzen 7' },
          memory: { totalBytes: 1024 ** 3 * 16, freeBytes: 1024 ** 3 * 10, usedBytes: 1024 ** 3 * 6 },
        }),
      ),
    )
    renderWithProviders(<DashboardPage />)

    const resourceSection = screen.getByText('Resource usage').closest('section')
    expect(resourceSection).not.toBeNull()
    const section = within(resourceSection as HTMLElement)

    expect(await section.findByText('8 cores')).toBeInTheDocument()
    expect(section.getByText('AMD Ryzen 7')).toBeInTheDocument()
    expect(section.getByText('6.00 GB / 16.00 GB')).toBeInTheDocument()
    expect(section.getByText('38% used')).toBeInTheDocument()

    // Uptime isn't part of this section - it stays in the main grid.
    expect(section.queryByText('3w 2d 5h 12m 45s')).not.toBeInTheDocument()
  })

  it('shows a "collecting data" placeholder for the CPU/memory charts after only one poll', async () => {
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('test-router')).toBeInTheDocument()
    // Two placeholders: the CPU card's chart and the Memory card's
    // chart - a single successful fetch only produces one sample,
    // and UsageChart needs at least two to draw a line.
    expect(screen.getAllByText('Collecting data…')).toHaveLength(2)
  })

  it('has a "Live charts" toggle, enabled by default, that can be turned off', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DashboardPage />)
    const toggle = screen.getByRole('checkbox', { name: /live charts/i })
    expect(toggle).toBeChecked()

    await user.click(toggle)
    expect(toggle).not.toBeChecked()
  })

  it('shows the throughput picker defaulting to the first physical/VLAN interface, with placeholders before a second poll', async () => {
    const interfaces = [
      { name: 'eth0', mtu: 1500, operState: 'up', adminState: 'up', addresses: [], rxBytes: 1000, txBytes: 2000 },
      { name: 'eth1', mtu: 1500, operState: 'up', adminState: 'up', addresses: [], rxBytes: 500, txBytes: 500 },
    ]
    server.use(http.get('/api/interfaces', () => HttpResponse.json({ interfaces })))
    renderWithProviders(<DashboardPage />)

    // "Throughput" is static markup present from the first render, so
    // it resolves before the interfaces query does - findByRole for
    // the picker (only rendered once interfaces have actually loaded)
    // is what really waits.
    const throughputSection = screen.getByText('Throughput').closest('section') as HTMLElement
    const section = within(throughputSection)

    const picker = await section.findByRole('combobox', { name: /throughput interface/i })
    expect(picker).toHaveValue('eth0')
    expect(section.getByRole('option', { name: 'eth1' })).toBeInTheDocument()
    // Only one poll has happened - nothing to compute a rate from yet.
    expect(section.getByText('Collecting data…')).toBeInTheDocument()
    expect(section.getByText(/download:\s*…/i)).toBeInTheDocument()
    expect(section.getByText(/upload:\s*…/i)).toBeInTheDocument()
  })

  it('lets the user pick a different interface from the throughput dropdown', async () => {
    const interfaces = [
      { name: 'eth0', mtu: 1500, operState: 'up', adminState: 'up', addresses: [], rxBytes: 1000, txBytes: 2000 },
      { name: 'eth1', mtu: 1500, operState: 'up', adminState: 'up', addresses: [], rxBytes: 500, txBytes: 500 },
    ]
    server.use(http.get('/api/interfaces', () => HttpResponse.json({ interfaces })))
    const user = userEvent.setup()
    renderWithProviders(<DashboardPage />)

    const throughputSection = screen.getByText('Throughput').closest('section') as HTMLElement
    const section = within(throughputSection)
    const picker = await section.findByRole('combobox', { name: /throughput interface/i })
    expect(picker).toHaveValue('eth0')

    await user.selectOptions(picker, 'eth1')
    expect(picker).toHaveValue('eth1')
  })

  it('shows a message instead of the throughput picker when no interfaces are available', async () => {
    server.use(http.get('/api/interfaces', () => HttpResponse.json({ interfaces: [] })))
    renderWithProviders(<DashboardPage />)

    const throughputSection = screen.getByText('Throughput').closest('section') as HTMLElement
    const section = within(throughputSection)
    expect(await section.findByText('No interfaces available yet.')).toBeInTheDocument()
    expect(section.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
