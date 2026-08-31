import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import UsersPage from './UsersPage'

const SYSTEM = {
  login: {
    user: {
      admin: {
        'full-name': 'Administrator',
        authentication: {
          'encrypted-password': '$6$masked',
          'public-keys': { 'admin@laptop': { key: 'AAAA...', type: 'ssh-ed25519' } },
        },
      },
      guest: { disable: {} },
    },
  },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: SYSTEM })))
})

describe('UsersPage', () => {
  it('renders users with their full name, disabled state, and "you" badge', async () => {
    renderWithProviders(<UsersPage />)

    expect(await screen.findByText('admin')).toBeInTheDocument()
    expect(screen.getByText('guest')).toBeInTheDocument()
    expect(screen.getByText('Administrator')).toBeInTheDocument()
    expect(screen.getByText('you')).toBeInTheDocument()
    expect(screen.getByText('disabled')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<UsersPage />)
    expect(await screen.findByText(/failed to load system configuration/i)).toBeInTheDocument()
  })

  it('creates a new user with a password', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UsersPage />)
    await screen.findByText('admin')

    await user.click(screen.getByRole('button', { name: /\+ new user/i }))
    await user.type(screen.getByLabelText(/username/i), 'bob')
    await user.type(screen.getByLabelText(/^password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /queue user creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['system', 'login', 'user', 'bob', 'authentication', 'plaintext-password'],
      value: 'secret123',
    })
  })

  // Regression test: an SSH public key used to only be addable AFTER
  // a user already existed - see UserForm.tsx's "First SSH public
  // key" field.
  it('creates a new user with a first SSH public key, all in one commit, and no password needed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UsersPage />)
    await screen.findByText('admin')

    await user.click(screen.getByRole('button', { name: /\+ new user/i }))
    await user.type(screen.getByLabelText(/username/i), 'bob')

    const form = screen.getByText('New user').closest('div.rounded-xl')
    if (!form) throw new Error('create form not found')
    await user.type(within(form as HTMLElement).getByPlaceholderText('alice@laptop'), 'bob@laptop')
    await user.type(within(form as HTMLElement).getByPlaceholderText(/base64 key data only/i), 'AAAABBBB')
    await user.click(within(form as HTMLElement).getByRole('button', { name: /queue user creation/i }))

    const ops = usePendingChangesStore.getState().changes.map((c) => c.op)
    // No plaintext-password op at all - a bare username plus a first
    // key needs no password, and setting the key's own deep path is
    // enough for VyOS to create the user's ancestor nodes implicitly.
    expect(ops).not.toContainEqual(
      expect.objectContaining({ path: ['system', 'login', 'user', 'bob', 'authentication', 'plaintext-password'] }),
    )
    expect(ops).toContainEqual({
      op: 'set',
      path: ['system', 'login', 'user', 'bob', 'authentication', 'public-keys', 'bob@laptop', 'key'],
      value: 'AAAABBBB',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['system', 'login', 'user', 'bob', 'authentication', 'public-keys', 'bob@laptop', 'type'],
      value: 'ssh-ed25519',
    })
  })

  it('deletes a user', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UsersPage />)
    await screen.findByText('guest')

    const guestCard = screen.getByText('guest').closest('div.rounded-xl')
    if (!guestCard) throw new Error('guest card not found')
    await user.click(within(guestCard as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['system', 'login', 'user', 'guest'] })
  })

  it('shows configured SSH keys and adds a new one', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UsersPage />)
    await screen.findByText('admin@laptop')

    const adminCard = screen.getByText('Administrator').closest('div.rounded-xl')
    if (!adminCard) throw new Error('admin card not found')
    await user.click(within(adminCard as HTMLElement).getByRole('button', { name: /\+ add key/i }))
    await user.type(within(adminCard as HTMLElement).getByPlaceholderText('alice@laptop'), 'admin@phone')
    await user.type(
      within(adminCard as HTMLElement).getByPlaceholderText(/base64 key data only/i),
      'AAAABBBB',
    )
    await user.click(within(adminCard as HTMLElement).getByRole('button', { name: /^add key$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: [
        'system',
        'login',
        'user',
        'admin',
        'authentication',
        'public-keys',
        'admin@phone',
        'key',
      ],
      value: 'AAAABBBB',
    })
  })

  it('removes an existing SSH key', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UsersPage />)
    await screen.findByText('admin@laptop')

    const row = screen.getByText('admin@laptop').closest('li')
    if (!row) throw new Error('key row not found')
    await user.click(within(row).getByRole('button', { name: /remove/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'delete',
      path: ['system', 'login', 'user', 'admin', 'authentication', 'public-keys', 'admin@laptop'],
    })
  })
})
