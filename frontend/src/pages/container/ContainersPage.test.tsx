import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { useSessionStore } from '../../store/session'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ContainersPage from './ContainersPage'

const CONTAINER = {
  name: {
    web: {
      image: 'nginx:latest',
      description: 'Web server',
      network: { NET01: { address: ['192.0.2.5'] } },
    },
    db: { image: 'postgres:16', disable: {} },
  },
  network: { NET01: { type: { bridge: {} } } },
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
  useSessionStore.setState({ user: 'admin', status: 'authenticated' })
  server.use(http.get('/api/config/tree', () => HttpResponse.json({ data: CONTAINER })))
})

describe('ContainersPage', () => {
  it('renders containers with their image and disabled state', async () => {
    renderWithProviders(<ContainersPage />)

    expect(await screen.findByText('web')).toBeInTheDocument()
    expect(screen.getByText('nginx:latest')).toBeInTheDocument()
    expect(screen.getByText('db')).toBeInTheDocument()
    expect(screen.getByText('disabled')).toBeInTheDocument()
  })

  it('shows an error message when the query fails', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<ContainersPage />)
    expect(await screen.findByText(/failed to load container configuration/i)).toBeInTheDocument()
  })

  it('creates a new container with an image', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ContainersPage />)
    await screen.findByText('web')

    await user.click(screen.getByRole('button', { name: /\+ new container/i }))
    await user.type(screen.getByLabelText(/^name/i), 'cache')
    await user.type(screen.getByLabelText(/^image/i), 'redis:7')
    await user.click(screen.getByRole('button', { name: /queue container creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'image'],
      value: 'redis:7',
    })
  })

  it('prompts to pull an image that is not present on the router yet', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/container/images', () => HttpResponse.json({ images: [] })))
    renderWithProviders(<ContainersPage />)
    await screen.findByText('web')

    await user.click(screen.getByRole('button', { name: /\+ new container/i }))
    await user.type(screen.getByLabelText(/^image/i), 'redis:7')

    expect(await screen.findByText('Not pulled onto this router yet.')).toBeInTheDocument()

    let pulledName: string | null = null
    server.use(
      http.post('/api/container/images', async ({ request }) => {
        const body = (await request.json()) as { name: string }
        pulledName = body.name
        return HttpResponse.json({ message: 'pulled successfully' })
      }),
      http.get('/api/container/images', () => HttpResponse.json({ images: [{ tags: ['redis:7'] }] })),
    )
    await user.click(screen.getByRole('button', { name: 'Pull now' }))

    await waitFor(() => expect(pulledName).toBe('redis:7'))
    await waitFor(() => expect(screen.queryByText('Not pulled onto this router yet.')).not.toBeInTheDocument())
  })

  it('does not prompt to pull an image that is already present on the router', async () => {
    server.use(http.get('/api/container/images', () => HttpResponse.json({ images: [{ tags: ['nginx:latest'] }] })))
    renderWithProviders(<ContainersPage />)
    await screen.findByText('web')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /\+ new container/i }))
    await user.type(screen.getByLabelText(/^image/i), 'nginx:latest')

    expect(screen.queryByText('Not pulled onto this router yet.')).not.toBeInTheDocument()
  })

  it('deletes a container', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ContainersPage />)
    await screen.findByText('db')

    const dbCard = screen.getByText('db').closest('div.rounded-xl')
    if (!dbCard) throw new Error('db card not found')
    await user.click(within(dbCard as HTMLElement).getByRole('button', { name: /^delete$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({ op: 'delete', path: ['container', 'name', 'db'] })
  })

  it('shows details including network attachment and lets a device be added', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ContainersPage />)
    await screen.findByText('web')

    const webCard = screen.getByText('web').closest('div.rounded-xl')
    if (!webCard) throw new Error('web card not found')
    await user.click(within(webCard as HTMLElement).getByRole('button', { name: /details/i }))

    expect(within(webCard as HTMLElement).getByText('NET01')).toBeInTheDocument()
    expect(within(webCard as HTMLElement).getByText('192.0.2.5')).toBeInTheDocument()

    await user.click(within(webCard as HTMLElement).getByRole('button', { name: /\+ add device/i }))
    await user.type(within(webCard as HTMLElement).getByPlaceholderText('name'), 'tun0')
    await user.type(within(webCard as HTMLElement).getByPlaceholderText('/dev/x (host)'), '/dev/net/tun')
    await user.click(within(webCard as HTMLElement).getByRole('button', { name: /^add device$/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'web', 'device', 'tun0', 'source'],
      value: '/dev/net/tun',
    })
  })
})
