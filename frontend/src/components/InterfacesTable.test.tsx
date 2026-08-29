import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { NetworkInterface } from '../lib/vyosApi'
import InterfacesTable from './InterfacesTable'

/** Reads the "Interface" (name) column of every data row, in the
 * order they're currently rendered - for asserting sort order. */
function renderedNames() {
  const rows = screen.getAllByRole('row').slice(1) // drop the header row
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent)
}

const eth0: NetworkInterface = {
  name: 'eth0',
  mac: '52:54:00:12:34:56',
  description: 'WAN',
  mtu: 1500,
  operState: 'up',
  adminState: 'up',
  addresses: [
    { family: 'inet', address: '203.0.113.5', prefixLen: 24, scope: 'global' },
    { family: 'inet6', address: '2001:db8::5', prefixLen: 64, scope: 'global' },
  ],
}

const eth1: NetworkInterface = {
  name: 'eth1',
  mac: '52:54:00:65:43:21',
  mtu: 1500,
  operState: 'down',
  adminState: 'down',
  addresses: [],
}

describe('InterfacesTable', () => {
  it('renders each interface with its MAC, addresses, MTU, and description', () => {
    render(<InterfacesTable interfaces={[eth0]} />)

    expect(screen.getByText('eth0')).toBeInTheDocument()
    expect(screen.getByText('52:54:00:12:34:56')).toBeInTheDocument()
    expect(screen.getByText('203.0.113.5/24')).toBeInTheDocument()
    expect(screen.getByText('2001:db8::5/64')).toBeInTheDocument()
    expect(screen.getByText('1500')).toBeInTheDocument()
    expect(screen.getByText('WAN')).toBeInTheDocument()
    expect(screen.getByText('up')).toBeInTheDocument()
  })

  it('shows a dash for interfaces with no addresses or description', () => {
    render(<InterfacesTable interfaces={[eth1]} />)
    // Addresses (empty list) and Description (unset) both fall back to
    // a dash for eth1; its MAC is set, so that column isn't a dash.
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('shows an empty-state message when there are no interfaces', () => {
    render(<InterfacesTable interfaces={[]} />)
    expect(screen.getByText(/no interfaces found/i)).toBeInTheDocument()
  })
})

describe('InterfacesTable sorting', () => {
  const base = { operState: 'up', adminState: 'up', addresses: [] }
  // Names and MTUs are deliberately inversely correlated, so a sort by
  // MTU produces a different, distinguishable row order than the
  // default sort by name - and MTU values are chosen so a naive
  // string sort ("1500" < "68" < "9000") would disagree with the
  // correct numeric one, catching a regression to string comparison.
  const aaa: NetworkInterface = { ...base, name: 'aaa', mtu: 9000 }
  const mmm: NetworkInterface = { ...base, name: 'mmm', mtu: 68 }
  const zzz: NetworkInterface = { ...base, name: 'zzz', mtu: 1500 }
  const interfaces = [aaa, mmm, zzz]

  it('sorts by name ascending by default', () => {
    render(<InterfacesTable interfaces={interfaces} />)
    expect(renderedNames()).toEqual(['aaa', 'mmm', 'zzz'])
  })

  it('sorts numerically (not alphabetically) by MTU when that column is clicked, then reverses on a second click', async () => {
    const user = userEvent.setup()
    render(<InterfacesTable interfaces={interfaces} />)

    await user.click(screen.getByRole('button', { name: 'MTU' }))
    expect(renderedNames()).toEqual(['mmm', 'zzz', 'aaa']) // 68, 1500, 9000

    await user.click(screen.getByRole('button', { name: 'MTU' }))
    expect(renderedNames()).toEqual(['aaa', 'zzz', 'mmm']) // 9000, 1500, 68
  })

  it('switching to a different column starts it ascending again', async () => {
    const user = userEvent.setup()
    render(<InterfacesTable interfaces={interfaces} />)

    await user.click(screen.getByRole('button', { name: 'MTU' }))
    await user.click(screen.getByRole('button', { name: 'Interface' }))
    expect(renderedNames()).toEqual(['aaa', 'mmm', 'zzz'])
  })
})
