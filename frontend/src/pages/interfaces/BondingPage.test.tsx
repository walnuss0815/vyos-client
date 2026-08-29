import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import BondingPage from './BondingPage'

const INTERFACES_CONFIG = {
  bonding: {
    bond0: {
      mode: 'active-backup',
      primary: 'eth2',
      member: { interface: ['eth2', 'eth3'] },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(
    http.get('/api/interfaces', () => HttpResponse.json({ interfaces: [] })),
    http.get('/api/config/tree', ({ request }) => {
      const path = new URL(request.url).searchParams.get('path')
      if (path === 'vrf') return HttpResponse.json({ data: { name: { red: { table: '100' } } } })
      return HttpResponse.json({ data: INTERFACES_CONFIG })
    }),
  )
})

describe('BondingPage', () => {
  it('renders existing bonds with their mode and members', async () => {
    renderWithProviders(<BondingPage />)

    expect(await screen.findByText('bond0')).toBeInTheDocument()
    expect(screen.getByText('active-backup')).toBeInTheDocument()
    expect(screen.getAllByText('eth2').length).toBeGreaterThan(0) // primary + member chip
    expect(screen.getByText('eth3')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no bonds', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    renderWithProviders(<BondingPage />)
    expect(await screen.findByText(/no bonds configured yet/i)).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<BondingPage />)
    expect(await screen.findByText(/failed to load interface configuration/i)).toBeInTheDocument()
  })

  it('creates a new bond with a non-default mode and first member', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BondingPage />)
    await screen.findByText('bond0')

    await user.click(screen.getByRole('button', { name: /new bond/i }))
    await user.type(screen.getByPlaceholderText('bond0'), 'bond1')
    await user.selectOptions(screen.getByRole('combobox'), 'active-backup')
    await user.type(screen.getByPlaceholderText('eth1'), 'eth4')
    await user.click(screen.getByRole('button', { name: /queue bond creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: { op: 'set', path: ['interfaces', 'bonding', 'bond1', 'member', 'interface'], value: 'eth4' },
        }),
        expect.objectContaining({
          op: { op: 'set', path: ['interfaces', 'bonding', 'bond1', 'mode'], value: 'active-backup' },
        }),
      ]),
    )
  })

  it('does not queue an explicit mode op when the default (802.3ad) is left selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BondingPage />)
    await screen.findByText('bond0')

    await user.click(screen.getByRole('button', { name: /new bond/i }))
    await user.type(screen.getByPlaceholderText('bond0'), 'bond1')
    await user.type(screen.getByPlaceholderText('eth1'), 'eth4')
    await user.click(screen.getByRole('button', { name: /queue bond creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['interfaces', 'bonding', 'bond1', 'member', 'interface'],
      value: 'eth4',
    })
  })

  it('rejects creating a bond with a name that already exists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BondingPage />)
    await screen.findByText('bond0')

    await user.click(screen.getByRole('button', { name: /new bond/i }))
    await user.type(screen.getByPlaceholderText('bond0'), 'bond0')
    await user.type(screen.getByPlaceholderText('eth1'), 'eth4')

    expect(screen.getByText(/bond bond0 already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /queue bond creation/i })).toBeDisabled()
  })

  it('requires a first member before allowing bond creation', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BondingPage />)
    await screen.findByText('bond0')

    await user.click(screen.getByRole('button', { name: /new bond/i }))
    await user.type(screen.getByPlaceholderText('bond0'), 'bond1')

    expect(screen.getByRole('button', { name: /queue bond creation/i })).toBeDisabled()
  })

  it('queues bond deletion', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BondingPage />)
    await screen.findByText('bond0')

    await user.click(screen.getByRole('button', { name: /delete bond/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['interfaces', 'bonding', 'bond0'] })
  })

  it('queues a member add and a member remove', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BondingPage />)
    await screen.findByText('bond0')

    await user.click(screen.getByLabelText('Remove member eth2 from bond bond0'))
    await user.type(screen.getByPlaceholderText('eth2'), 'eth5')
    await user.click(screen.getByRole('button', { name: /add member/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      expect.objectContaining({
        op: { op: 'delete', path: ['interfaces', 'bonding', 'bond0', 'member', 'interface'], value: 'eth2' },
      }),
      expect.objectContaining({
        op: { op: 'set', path: ['interfaces', 'bonding', 'bond0', 'member', 'interface'], value: 'eth5' },
      }),
    ])
  })

  it('queues a diff of changes when editing a bond', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BondingPage />)
    await screen.findByText('bond0')

    const [editButton] = screen.getAllByRole('button', { name: 'Edit' })
    await user.click(editButton)

    const primaryInput = screen.getByDisplayValue('eth2')
    await user.clear(primaryInput)
    await user.type(primaryInput, 'eth3')
    await user.click(screen.getByRole('button', { name: /queue changes/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toEqual([
      {
        id: expect.any(String),
        op: { op: 'set', path: ['interfaces', 'bonding', 'bond0', 'primary'], value: 'eth3' },
        label: expect.any(String),
      },
    ])
  })

  it('offers the VRF picker populated from configured VRFs', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BondingPage />)
    await screen.findByText('bond0')

    const [editButton] = screen.getAllByRole('button', { name: 'Edit' })
    await user.click(editButton)

    expect(screen.getByRole('option', { name: 'red' })).toBeInTheDocument()
  })
})
