import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import GeneralPage from './GeneralPage'

const SYSTEM = {
  'host-name': 'router1',
  'domain-name': 'example.com',
  'time-zone': 'UTC',
  'name-server': ['1.1.1.1'],
  'domain-search': ['example.com'],
  'static-host-mapping': {
    'host-name': { fileserver: { inet: ['10.0.0.5'], alias: ['files'] } },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: SYSTEM })))
})

describe('GeneralPage', () => {
  it('renders identity settings, DNS, and static host mappings', async () => {
    renderWithProviders(<GeneralPage />)

    expect(await screen.findByDisplayValue('router1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('UTC')).toBeInTheDocument()
    expect(screen.getByText('1.1.1.1')).toBeInTheDocument()
    expect(screen.getByText('fileserver')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument()
    expect(screen.getByText('files')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<GeneralPage />)
    expect(await screen.findByText(/failed to load system configuration/i)).toBeInTheDocument()
  })

  it('saves a changed host-name', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GeneralPage />)
    const hostNameInput = await screen.findByDisplayValue('router1')

    await user.clear(hostNameInput)
    await user.type(hostNameInput, 'router2')
    await user.click(screen.getByRole('button', { name: /save identity settings/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['system', 'host-name'], value: 'router2' })
  })

  it('adds a DNS name server', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GeneralPage />)
    await screen.findByText('1.1.1.1')

    const dnsSection = screen.getByText('DNS name servers').closest('div')
    if (!dnsSection) throw new Error('DNS section not found')
    await user.type(within(dnsSection as HTMLElement).getByPlaceholderText('1.1.1.1'), '9.9.9.9')
    await user.click(within(dnsSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'set', path: ['system', 'name-server'], value: '9.9.9.9' })
  })

  it('creates a new static host mapping', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GeneralPage />)
    await screen.findByText('fileserver')

    await user.click(screen.getByRole('button', { name: /\+ new mapping/i }))
    await user.type(screen.getByPlaceholderText('fileserver'), 'printer')
    const createForm = screen.getByPlaceholderText('fileserver').closest('div.mb-3')
    if (!createForm) throw new Error('create form not found')
    await user.type(within(createForm as HTMLElement).getByPlaceholderText('10.0.0.5'), '10.0.0.9')
    await user.click(within(createForm as HTMLElement).getByRole('button', { name: /queue mapping creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['system', 'static-host-mapping', 'host-name', 'printer', 'inet'],
      value: '10.0.0.9',
    })
  })

  it('deletes a static host mapping', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GeneralPage />)
    await screen.findByText('fileserver')

    const card = screen.getByText('fileserver').closest('div.rounded-lg')
    if (!card) throw new Error('mapping card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /delete/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['system', 'static-host-mapping', 'host-name', 'fileserver'],
    })
  })
})
