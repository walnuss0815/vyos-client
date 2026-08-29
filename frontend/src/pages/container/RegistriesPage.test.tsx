import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import RegistriesPage from './RegistriesPage'

const CONTAINER = {
  registry: {
    'docker.io': {
      authentication: { username: 'alice', password: 'super-secret' },
      insecure: {},
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: CONTAINER })))
})

function registryNameHeading() {
  return screen.getByText('docker.io', { selector: 'span' })
}

describe('RegistriesPage', () => {
  it('renders registries with username, password-set indicator, and insecure badge', async () => {
    renderWithProviders(<RegistriesPage />)

    expect(await screen.findByText('docker.io', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/alice/)).toBeInTheDocument()
    expect(screen.getByText(/password set/i)).toBeInTheDocument()
    expect(screen.getByText('insecure')).toBeInTheDocument()
    expect(screen.queryByText('super-secret')).not.toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<RegistriesPage />)
    expect(await screen.findByText(/failed to load container configuration/i)).toBeInTheDocument()
  })

  it('creates a new registry with a password', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RegistriesPage />)
    await screen.findByText('docker.io', { selector: 'span' })

    await user.click(screen.getByRole('button', { name: /\+ new registry/i }))
    await user.type(screen.getByLabelText(/registry name/i), 'quay.io')
    await user.type(screen.getByLabelText(/^password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /queue registry creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['container', 'registry', 'quay.io', 'authentication', 'password'],
      value: 'secret123',
    })
  })

  it('deletes a registry', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RegistriesPage />)
    await screen.findByText('docker.io', { selector: 'span' })

    const card = registryNameHeading().closest('div.rounded-xl')
    if (!card) throw new Error('registry card not found')
    await user.click(within(card as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['container', 'registry', 'docker.io'] })
  })
})
