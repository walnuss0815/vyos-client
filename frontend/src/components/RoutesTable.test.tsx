import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Route } from '../lib/vyosApi'
import RoutesTable from './RoutesTable'

/** Reads the "Prefix" column of every data row, in the order they're
 * currently rendered - for asserting sort order. */
function renderedPrefixes() {
  const rows = screen.getAllByRole('row').slice(1) // drop the header row
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent)
}

const staticRoute: Route = {
  prefix: '0.0.0.0/0',
  protocol: 'static',
  selected: true,
  distance: 1,
  metric: 0,
  uptime: '1d02h34m',
  nexthops: [{ ip: '203.0.113.1', interfaceName: 'eth0', active: true }],
}

const connectedRoute: Route = {
  prefix: '192.168.1.0/24',
  protocol: 'connected',
  selected: true,
  distance: 0,
  metric: 0,
  nexthops: [{ interfaceName: 'eth1', active: true, directlyConnected: true }],
}

describe('RoutesTable', () => {
  it('renders each route with its prefix, protocol, distance/metric, next hop, and uptime', () => {
    render(<RoutesTable routes={[staticRoute]} />)

    expect(screen.getByText('0.0.0.0/0')).toBeInTheDocument()
    expect(screen.getByText('static')).toBeInTheDocument()
    expect(screen.getByText('1/0')).toBeInTheDocument()
    expect(screen.getByText('203.0.113.1')).toBeInTheDocument()
    expect(screen.getByText(/via eth0/)).toBeInTheDocument()
    expect(screen.getByText('1d02h34m')).toBeInTheDocument()
  })

  it('shows "directly connected" for a connected route with no IP next hop', () => {
    render(<RoutesTable routes={[connectedRoute]} />)
    expect(screen.getByText('directly connected')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no routes', () => {
    render(<RoutesTable routes={[]} />)
    expect(screen.getByText(/no routes found/i)).toBeInTheDocument()
  })
})

describe('RoutesTable sorting', () => {
  // Protocols and distances are deliberately inversely correlated with
  // prefix, so a sort by distance/metric produces a distinguishable
  // row order from the default sort by protocol.
  const a: Route = { prefix: 'a.0.0.0/8', protocol: 'zprotocol', selected: false, distance: 10, metric: 0, nexthops: [] }
  const m: Route = { prefix: 'm.0.0.0/8', protocol: 'mprotocol', selected: false, distance: 5, metric: 0, nexthops: [] }
  const z: Route = { prefix: 'z.0.0.0/8', protocol: 'aprotocol', selected: false, distance: 1, metric: 0, nexthops: [] }
  const routes = [a, m, z]

  it('sorts by protocol ascending by default', () => {
    render(<RoutesTable routes={routes} />)
    // aprotocol (z), mprotocol (m), zprotocol (a)
    expect(renderedPrefixes()).toEqual(['z.0.0.0/8', 'm.0.0.0/8', 'a.0.0.0/8'])
  })

  it('sorts by distance/metric when that column is clicked, then reverses on a second click', async () => {
    const user = userEvent.setup()
    render(<RoutesTable routes={routes} />)

    await user.click(screen.getByRole('button', { name: 'Distance/Metric' }))
    expect(renderedPrefixes()).toEqual(['z.0.0.0/8', 'm.0.0.0/8', 'a.0.0.0/8']) // distance 1, 5, 10

    await user.click(screen.getByRole('button', { name: 'Distance/Metric' }))
    expect(renderedPrefixes()).toEqual(['a.0.0.0/8', 'm.0.0.0/8', 'z.0.0.0/8']) // distance 10, 5, 1
  })

  it('sorts by prefix when that column is clicked', async () => {
    const user = userEvent.setup()
    render(<RoutesTable routes={routes} />)

    await user.click(screen.getByRole('button', { name: 'Prefix' }))
    expect(renderedPrefixes()).toEqual(['a.0.0.0/8', 'm.0.0.0/8', 'z.0.0.0/8'])
  })
})
