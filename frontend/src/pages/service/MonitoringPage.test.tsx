import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import MonitoringPage from './MonitoringPage'

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
})

describe('MonitoringPage', () => {
  it('shows enable prompts for each sub-area when absent', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    renderWithProviders(<MonitoringPage />)

    expect(await screen.findByText(/node exporter is not configured/i)).toBeInTheDocument()
    expect(screen.getByText(/frr exporter is not configured/i)).toBeInTheDocument()
    expect(screen.getByText(/zabbix agent is not configured/i)).toBeInTheDocument()
    expect(screen.getByText(/network event monitoring is not configured/i)).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<MonitoringPage />)
    expect(await screen.findByText(/failed to load service configuration/i)).toBeInTheDocument()
  })

  it('enables node exporter', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await screen.findByText(/node exporter is not configured/i)
    await user.click(screen.getByRole('button', { name: /^enable node exporter$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'monitoring', 'prometheus', 'node-exporter'],
    })
  })

  it('adds a zabbix active server once enabled', async () => {
    const monitoring = { monitoring: { 'zabbix-agent': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: monitoring })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    const activeServersLabel = await screen.findByText(/active servers/i)
    const section = activeServersLabel.closest('div.mt-3')
    if (!section) throw new Error('active servers section not found')
    await user.click(within(section as HTMLElement).getByRole('button', { name: /\+ add/i }))
    await user.type(within(section as HTMLElement).getByPlaceholderText('192.0.2.2'), '192.0.2.2')
    await user.click(within(section as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'monitoring', 'zabbix-agent', 'server-active', '192.0.2.2'],
    })
  })

  it('saves network event settings', async () => {
    const monitoring = { monitoring: { 'network-event': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: monitoring })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await screen.findByRole('checkbox', { name: /^route/i })
    await user.click(screen.getByRole('checkbox', { name: /^route/i }))
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['service', 'monitoring', 'network-event', 'event', 'route'],
    })
  })

  // Regression tests: see store/pendingChanges.ts's withPendingEnable.
  // Each of Monitoring's 4 sub-areas is gated independently, so each
  // needs its own enable/disable-immediacy coverage.
  it('shows the Node Exporter form immediately after clicking its Enable button, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await user.click(await screen.findByRole('button', { name: /^enable node exporter$/i }))

    expect(await screen.findByText(/collect textfile metrics/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^disable node exporter$/i })).toBeInTheDocument()
  })

  it('reverts Node Exporter to its enable prompt immediately after clicking Disable, without committing', async () => {
    const monitoring = { monitoring: { prometheus: { 'node-exporter': {} } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: monitoring })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)
    await screen.findByRole('button', { name: /^disable node exporter$/i })

    await user.click(screen.getByRole('button', { name: /^disable node exporter$/i }))

    expect(await screen.findByText(/node exporter is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^enable node exporter$/i })).toBeInTheDocument()
  })

  it('shows the FRR Exporter form immediately after clicking its Enable button, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await user.click(await screen.findByRole('button', { name: /^enable frr exporter$/i }))

    expect(await screen.findByRole('button', { name: /^disable frr exporter$/i })).toBeInTheDocument()
  })

  it('reverts FRR Exporter to its enable prompt immediately after clicking Disable, without committing', async () => {
    const monitoring = { monitoring: { prometheus: { 'frr-exporter': {} } } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: monitoring })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)
    await screen.findByRole('button', { name: /^disable frr exporter$/i })

    await user.click(screen.getByRole('button', { name: /^disable frr exporter$/i }))

    expect(await screen.findByText(/frr exporter is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^enable frr exporter$/i })).toBeInTheDocument()
  })

  it('shows the Zabbix Agent form immediately after clicking its Enable button, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await user.click(await screen.findByRole('button', { name: /^enable zabbix agent$/i }))

    expect(await screen.findByRole('button', { name: /^disable zabbix agent$/i })).toBeInTheDocument()
  })

  it('reverts Zabbix Agent to its enable prompt immediately after clicking Disable, without committing', async () => {
    const monitoring = { monitoring: { 'zabbix-agent': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: monitoring })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)
    await screen.findByRole('button', { name: /^disable zabbix agent$/i })

    await user.click(screen.getByRole('button', { name: /^disable zabbix agent$/i }))

    expect(await screen.findByText(/zabbix agent is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^enable zabbix agent$/i })).toBeInTheDocument()
  })

  it('shows the Network Events form immediately after clicking its Enable button, without committing', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await user.click(await screen.findByRole('button', { name: /^enable network events$/i }))

    expect(await screen.findByRole('button', { name: /^disable network events$/i })).toBeInTheDocument()
  })

  it('reverts Network Events to its enable prompt immediately after clicking Disable, without committing', async () => {
    const monitoring = { monitoring: { 'network-event': {} } }
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: monitoring })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)
    await screen.findByRole('button', { name: /^disable network events$/i })

    await user.click(screen.getByRole('button', { name: /^disable network events$/i }))

    expect(await screen.findByText(/network event monitoring is not configured/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^enable network events$/i })).toBeInTheDocument()
  })

  // Regression tests: see store/pendingChanges.ts's latestPendingOp.
  // Each of Monitoring's 4 sub-areas is gated independently, so each
  // needs its own re-enable-after-cycle coverage.
  it('re-enables Node Exporter after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await user.click(await screen.findByRole('button', { name: /^enable node exporter$/i }))
    await user.click(await screen.findByRole('button', { name: /^disable node exporter$/i }))
    await screen.findByRole('button', { name: /^enable node exporter$/i })
    await user.click(screen.getByRole('button', { name: /^enable node exporter$/i }))

    expect(await screen.findByText(/collect textfile metrics/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^disable node exporter$/i })).toBeInTheDocument()
  })

  it('re-enables FRR Exporter after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await user.click(await screen.findByRole('button', { name: /^enable frr exporter$/i }))
    await user.click(await screen.findByRole('button', { name: /^disable frr exporter$/i }))
    await screen.findByRole('button', { name: /^enable frr exporter$/i })
    await user.click(screen.getByRole('button', { name: /^enable frr exporter$/i }))

    expect(await screen.findByRole('button', { name: /^disable frr exporter$/i })).toBeInTheDocument()
  })

  it('re-enables Zabbix Agent after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await user.click(await screen.findByRole('button', { name: /^enable zabbix agent$/i }))
    await user.click(await screen.findByRole('button', { name: /^disable zabbix agent$/i }))
    await screen.findByRole('button', { name: /^enable zabbix agent$/i })
    await user.click(screen.getByRole('button', { name: /^enable zabbix agent$/i }))

    expect(await screen.findByRole('button', { name: /^disable zabbix agent$/i })).toBeInTheDocument()
  })

  it('re-enables Network Events after an enable -> disable -> enable cycle, all uncommitted', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    const user = userEvent.setup()
    renderWithProviders(<MonitoringPage />)

    await user.click(await screen.findByRole('button', { name: /^enable network events$/i }))
    await user.click(await screen.findByRole('button', { name: /^disable network events$/i }))
    await screen.findByRole('button', { name: /^enable network events$/i })
    await user.click(screen.getByRole('button', { name: /^enable network events$/i }))

    expect(await screen.findByRole('button', { name: /^disable network events$/i })).toBeInTheDocument()
  })
})
