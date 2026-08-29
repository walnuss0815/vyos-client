import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import SyslogPage from './SyslogPage'

const SYSTEM = {
  syslog: {
    local: { facility: { all: { level: 'info' } } },
    remote: {
      '10.0.0.1': {
        facility: { all: { level: 'debug' } },
        protocol: 'tcp',
        port: '6514',
      },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: SYSTEM })))
})

describe('SyslogPage', () => {
  it('renders local and remote facility rules', async () => {
    renderWithProviders(<SyslogPage />)

    expect(await screen.findByText('10.0.0.1')).toBeInTheDocument()
    const localList = screen.getByText(/local logging/i).closest('div.rounded-xl')?.querySelector('ul')
    if (!localList) throw new Error('local facility list not found')
    expect(within(localList).getByText('all')).toBeInTheDocument()
    expect(within(localList).getByText('level info')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<SyslogPage />)
    expect(await screen.findByText(/failed to load system configuration/i)).toBeInTheDocument()
  })

  it('adds a local facility rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SyslogPage />)
    await screen.findByText('10.0.0.1')

    await user.selectOptions(screen.getByLabelText('Local facility'), 'kern')
    await user.selectOptions(screen.getByLabelText('Local level'), 'err')
    const localSection = screen.getByText(/local logging/i).closest('div.rounded-xl')
    if (!localSection) throw new Error('local section not found')
    await user.click(within(localSection as HTMLElement).getByRole('button', { name: /^add$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toEqual([
      { op: 'set', path: ['system', 'syslog', 'local', 'facility', 'kern'] },
      { op: 'set', path: ['system', 'syslog', 'local', 'facility', 'kern', 'level'], value: 'err' },
    ])
  })

  it('removes a local facility rule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SyslogPage />)
    await screen.findByText('10.0.0.1')

    const localSection = screen.getByText(/local logging/i).closest('div.rounded-xl')
    if (!localSection) throw new Error('local section not found')
    await user.click(within(localSection as HTMLElement).getByRole('button', { name: /remove/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['system', 'syslog', 'local', 'facility', 'all'] })
  })

  it('creates a new remote logging host', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SyslogPage />)
    await screen.findByText('10.0.0.1')

    await user.click(screen.getByRole('button', { name: /\+ new remote host/i }))
    await user.type(screen.getByPlaceholderText('10.0.0.1'), '10.0.0.2')
    await user.selectOptions(screen.getByLabelText('New remote host facility'), 'kern')
    await user.click(screen.getByRole('button', { name: /queue host creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['system', 'syslog', 'remote', '10.0.0.2', 'facility', 'kern'],
    })
  })

  it('deletes a remote logging host', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SyslogPage />)
    await screen.findByText('10.0.0.1')

    const hostCard = screen.getByText('10.0.0.1').closest('div.rounded-lg')
    if (!hostCard) throw new Error('host card not found')
    await user.click(within(hostCard as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['system', 'syslog', 'remote', '10.0.0.1'] })
  })

  it('sets the protocol on an existing remote host', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SyslogPage />)
    await screen.findByText('10.0.0.1')

    await user.click(screen.getByRole('button', { name: /^set udp$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['system', 'syslog', 'remote', '10.0.0.1', 'protocol'],
      value: 'udp',
    })
  })
})
