import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import OSPFPage from './OSPFPage'

const PROTOCOLS_OSPF = {
  parameters: { 'router-id': '192.0.2.1' },
  area: {
    '0': { network: ['192.0.2.0/24'] },
  },
  interface: {
    eth0: { area: '0', cost: '10' },
  },
  redistribute: { static: { metric: '20' } },
}

const PROTOCOLS_OSPFV3 = {
  parameters: { 'router-id': '192.0.2.2' },
  area: {
    '0': {},
  },
  interface: {
    eth0: { area: '0' },
  },
  redistribute: {},
}

function mockOSPFTree() {
  server.use(
    http.get('/api/config/tree', ({ request }) => {
      const url = new URL(request.url)
      const path = url.searchParams.get('path')
      if (path === 'protocols,ospf') return HttpResponse.json({ data: PROTOCOLS_OSPF })
      if (path === 'protocols,ospfv3') return HttpResponse.json({ data: PROTOCOLS_OSPFV3 })
      return HttpResponse.json({ data: {} })
    }),
  )
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  mockOSPFTree()
})

describe('OSPFPage', () => {
  it('renders OSPFv2 by default: global settings, areas, interfaces, redistribution', async () => {
    renderWithProviders(<OSPFPage />)

    expect(await screen.findByDisplayValue('192.0.2.1')).toBeInTheDocument()
    expect(screen.getByText('Area 0')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.0/24')).toBeInTheDocument()
    expect(screen.getByText('eth0')).toBeInTheDocument()
    expect(screen.getByText('metric 20')).toBeInTheDocument()
  })

  it('switches to the OSPFv3 tab and shows its own (separately-fetched) data', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    await screen.findByDisplayValue('192.0.2.1')

    await user.click(screen.getByRole('button', { name: /ospfv3/i }))

    expect(await screen.findByDisplayValue('192.0.2.2')).toBeInTheDocument()
    // OSPFv2's default-metric field is ospf-only and should not appear.
    expect(screen.queryByText(/default metric/i)).not.toBeInTheDocument()
  })

  it('shows an error message when the OSPF config query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<OSPFPage />)
    expect(await screen.findByText(/failed to load ospf configuration/i)).toBeInTheDocument()
  })

  it('saves a changed router-id from the global settings form', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    const routerIdInput = await screen.findByDisplayValue('192.0.2.1')

    await user.clear(routerIdInput)
    await user.type(routerIdInput, '192.0.2.9')
    await user.click(screen.getByRole('button', { name: /save global settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['protocols', 'ospf', 'parameters', 'router-id'],
      value: '192.0.2.9',
    })
  })

  it('creates a new stub area', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    await screen.findByText('Area 0')

    await user.click(screen.getByRole('button', { name: /\+ new area/i }))
    await user.type(screen.getByLabelText(/area id/i), '1')
    await user.selectOptions(screen.getByLabelText(/area type/i), 'stub')
    await user.click(screen.getByRole('button', { name: /queue area creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'area', '1', 'area-type', 'stub'] },
    ])
  })

  it('deletes an area', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    await screen.findByText('Area 0')

    const areaCard = screen.getByText('Area 0').closest('div.rounded-xl')
    if (!areaCard) throw new Error('area card not found')
    await user.click(within(areaCard as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['protocols', 'ospf', 'area', '0'] })
  })

  it('adds a network to an area via the ChipList', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    await screen.findByText('Area 0')

    const networksSection = screen.getByText(/enable ospf on matching interfaces/i).closest('div')
    if (!networksSection) throw new Error('networks section not found')
    await user.type(
      within(networksSection as HTMLElement).getByPlaceholderText('192.0.2.0/24'),
      '203.0.113.0/24',
    )
    await user.click(within(networksSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['protocols', 'ospf', 'area', '0', 'network'],
      value: '203.0.113.0/24',
    })
  })

  it('adds a range to an area', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    await screen.findByText('Area 0')

    await user.click(screen.getByRole('button', { name: /\+ add range/i }))
    const rangesSection = screen.getByText(/summarized ranges/i).closest('div.mt-3')
    if (!rangesSection) throw new Error('ranges section not found')
    await user.type(
      within(rangesSection as HTMLElement).getByPlaceholderText('192.0.2.0/24'),
      '198.51.100.0/24',
    )
    await user.click(within(rangesSection as HTMLElement).getByRole('button', { name: /^add range$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'area', '0', 'range', '198.51.100.0/24'] },
    ])
  })

  it('creates a new interface', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    await screen.findByText('eth0')

    await user.click(screen.getByRole('button', { name: /\+ new interface/i }))
    await user.type(screen.getByLabelText(/interface \*/i), 'eth1')
    await user.type(screen.getByLabelText(/^area$/i), '0')
    await user.click(screen.getByRole('button', { name: /queue interface creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['protocols', 'ospf', 'interface', 'eth1', 'area'],
      value: '0',
    })
  })

  it('deletes an interface', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    await screen.findByText('eth0')

    const ifaceRow = screen.getByText('eth0').closest('div.flex.items-center.justify-between')
    if (!ifaceRow) throw new Error('interface row not found')
    await user.click(within(ifaceRow as HTMLElement).getByRole('button', { name: /delete/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['protocols', 'ospf', 'interface', 'eth0'] })
  })

  it('adds a redistribution source with a metric', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    await screen.findByText('metric 20')

    await user.selectOptions(screen.getByLabelText(/redistribution source/i), 'connected')
    const redistributionSection = screen.getByText('Redistribution').closest('div.rounded-xl')
    if (!redistributionSection) throw new Error('redistribution section not found')
    await user.type(
      within(redistributionSection as HTMLElement).getByPlaceholderText(/metric \(optional\)/i),
      '50',
    )
    await user.click(within(redistributionSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual([
      { op: 'set', path: ['protocols', 'ospf', 'redistribute', 'connected'] },
      {
        op: 'set',
        path: ['protocols', 'ospf', 'redistribute', 'connected', 'metric'],
        value: '50',
      },
    ])
  })

  it('removes an existing redistribution source', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OSPFPage />)
    await screen.findByText('metric 20')

    const row = screen.getByText('metric 20').closest('li')
    if (!row) throw new Error('redistribution row not found')
    await user.click(within(row).getByRole('button', { name: /remove/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['protocols', 'ospf', 'redistribute', 'static'] })
  })
})
