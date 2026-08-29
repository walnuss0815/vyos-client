import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import VrfPage from './VrfPage'

const VRF_CONFIG = {
  name: {
    red: { table: '100' },
    blue: { table: '200' },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: VRF_CONFIG })))
})

describe('VrfPage', () => {
  it('renders VRFs with their routing table IDs, sorted by name', async () => {
    renderWithProviders(<VrfPage />)

    expect(await screen.findByText('blue')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('red')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no VRFs', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: {} })))
    renderWithProviders(<VrfPage />)
    expect(await screen.findByText(/no vrfs configured yet/i)).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<VrfPage />)
    expect(await screen.findByText(/failed to load vrf configuration/i)).toBeInTheDocument()
  })

  it('queues VRF deletion', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VrfPage />)
    await screen.findByText('red')

    const [firstDelete] = screen.getAllByRole('button', { name: /delete vrf/i })
    await user.click(firstDelete)

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['vrf', 'name', 'blue'] })
  })

  it('creates a new VRF with a name and routing table ID', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VrfPage />)
    await screen.findByText('red')

    await user.click(screen.getByRole('button', { name: /new vrf/i }))
    await user.type(screen.getByPlaceholderText('red'), 'green')
    await user.type(screen.getByPlaceholderText('100'), '300')
    await user.click(screen.getByRole('button', { name: /queue vrf creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['vrf', 'name', 'green', 'table'], value: '300' })
  })

  it('rejects a non-numeric routing table ID', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VrfPage />)
    await screen.findByText('red')

    await user.click(screen.getByRole('button', { name: /new vrf/i }))
    await user.type(screen.getByPlaceholderText('red'), 'green')
    await user.type(screen.getByPlaceholderText('100'), 'not-a-number')

    expect(screen.getByRole('button', { name: /queue vrf creation/i })).toBeDisabled()
    expect(screen.getByText(/must be a whole number/i)).toBeInTheDocument()
  })

  it('rejects an invalid VRF name', async () => {
    const user = userEvent.setup()
    renderWithProviders(<VrfPage />)
    await screen.findByText('red')

    await user.click(screen.getByRole('button', { name: /new vrf/i }))
    await user.type(screen.getByPlaceholderText('red'), 'invalid name')
    await user.type(screen.getByPlaceholderText('100'), '300')

    expect(screen.getByRole('button', { name: /queue vrf creation/i })).toBeDisabled()
  })
})
