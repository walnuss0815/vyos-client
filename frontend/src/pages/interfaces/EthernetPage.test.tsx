import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import EthernetPage from './EthernetPage'

const OPERATIONAL_INTERFACES = [
  { name: 'eth0', mac: '52:54:00:00:00:01', mtu: 1500, operState: 'up', adminState: 'up', addresses: [] },
  { name: 'eth1', mac: '52:54:00:00:00:02', mtu: 1500, operState: 'down', adminState: 'up', addresses: [] },
  { name: 'wlan0', mac: '52:54:00:00:00:03', mtu: 1500, operState: 'up', adminState: 'up', addresses: [] },
  { name: 'bond0', mac: '52:54:00:00:00:04', mtu: 1500, operState: 'up', adminState: 'up', addresses: [] },
  { name: 'eth0.10', mac: '52:54:00:00:00:05', mtu: 1500, operState: 'up', adminState: 'up', addresses: [] },
]

const INTERFACES_CONFIG = {
  ethernet: {
    eth0: {
      address: ['192.0.2.1/24'],
      description: 'WAN',
      mtu: '1500',
      vrf: 'red',
    },
    // eth1 intentionally has no config at all yet.
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(
    http.get('/api/interfaces', () => HttpResponse.json({ interfaces: OPERATIONAL_INTERFACES })),
    http.get('/api/config/tree', ({ request }) => {
      const path = new URL(request.url).searchParams.get('path')
      if (path === 'vrf') return HttpResponse.json({ data: { name: { red: { table: '100' } } } })
      return HttpResponse.json({ data: INTERFACES_CONFIG })
    }),
  )
})

describe('EthernetPage', () => {
  it('shows a card for every physical Ethernet interface, excluding WiFi/virtual/VLAN ones', async () => {
    renderWithProviders(<EthernetPage />)

    expect(await screen.findByText('eth0')).toBeInTheDocument()
    expect(screen.getByText('eth1')).toBeInTheDocument()
    expect(screen.queryByText('wlan0')).not.toBeInTheDocument()
    expect(screen.queryByText('bond0')).not.toBeInTheDocument()
    expect(screen.queryByText('eth0.10')).not.toBeInTheDocument()
  })

  it('shows configured values for an interface that has config', async () => {
    renderWithProviders(<EthernetPage />)
    await screen.findByText('eth0')

    expect(screen.getByText('WAN')).toBeInTheDocument()
    expect(screen.getByText('192.0.2.1/24')).toBeInTheDocument()
    const [mtuValue] = screen.getAllByText('1500')
    expect(mtuValue).toBeInTheDocument()
    expect(screen.getByText('red')).toBeInTheDocument()
  })

  it('shows blank defaults for a physical interface with no config yet', async () => {
    renderWithProviders(<EthernetPage />)
    const eth1Heading = await screen.findByText('eth1')
    const card = eth1Heading.closest('div')?.parentElement?.parentElement as HTMLElement
    expect(within(card).getByText(/no addresses configured/i)).toBeInTheDocument()
  })

  it('queues a diff of changes when editing an interface', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EthernetPage />)
    await screen.findByText('eth0')

    const [editButton] = screen.getAllByRole('button', { name: 'Edit' })
    await user.click(editButton)

    const descriptionInput = screen.getByDisplayValue('WAN')
    await user.clear(descriptionInput)
    await user.type(descriptionInput, 'WAN uplink')
    await user.click(screen.getByRole('button', { name: /queue changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      {
        id: expect.any(String),
        op: { op: 'set', path: ['interfaces', 'ethernet', 'eth0', 'description'], value: 'WAN uplink' },
        label: expect.any(String),
      },
    ])
  })

  it('offers the VRF picker populated from configured VRFs', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EthernetPage />)
    await screen.findByText('eth0')

    const [editButton] = screen.getAllByRole('button', { name: 'Edit' })
    await user.click(editButton)

    expect(screen.getByRole('option', { name: 'red' })).toBeInTheDocument()
  })

  it('shows an error message when either query fails', async () => {
    server.use(http.get('/api/interfaces', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<EthernetPage />)
    expect(await screen.findByText(/failed to load interface configuration/i)).toBeInTheDocument()
  })

  it('shows a message when no Ethernet interfaces are detected', async () => {
    server.use(http.get('/api/interfaces', () => HttpResponse.json({ interfaces: [] })))
    renderWithProviders(<EthernetPage />)
    expect(await screen.findByText(/no ethernet interfaces detected/i)).toBeInTheDocument()
  })
})
