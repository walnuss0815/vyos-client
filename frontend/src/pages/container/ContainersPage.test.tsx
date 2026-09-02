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

  // Regression test: containerFormToOps used to queue nothing at all
  // for a container created with only a name (every other field left
  // blank), silently leaving the pending-changes cart empty with
  // nothing to commit.
  it('queues a pending change for a container created with only a name', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ContainersPage />)
    await screen.findByText('web')

    await user.click(screen.getByRole('button', { name: /\+ new container/i }))
    await user.type(screen.getByLabelText(/^name/i), 'bare')
    await user.click(screen.getByRole('button', { name: /queue container creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({ op: 'set', path: ['container', 'name', 'bare'] })
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

  // Regression test for the original complaint: volume mounts (and
  // every other nested resource) used to only be definable AFTER a
  // container already existed - see ContainerCreateNestedSections.tsx.
  it('creates a container with a volume mount defined at creation time, in the same commit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ContainersPage />)
    await screen.findByText('web')

    await user.click(screen.getByRole('button', { name: /\+ new container/i }))
    await user.type(screen.getByLabelText(/^name/i), 'cache')
    await user.type(screen.getByLabelText(/^image/i), 'redis:7')

    await user.click(screen.getByRole('button', { name: /\+ add volume mount/i }))
    await user.type(screen.getByPlaceholderText('name'), 'data')
    await user.type(screen.getByPlaceholderText('/config/my-app/data'), '/config/redis/data')
    await user.type(screen.getByPlaceholderText('/container/dir'), '/data')
    await user.click(screen.getByRole('button', { name: /^add volume mount$/i }))

    // Nothing queued yet - only the container's own "Queue container
    // creation" click should actually commit anything to the pending
    // changes list.
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /queue container creation/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'image'],
      value: 'redis:7',
    })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'volume', 'data', 'source'],
      value: '/config/redis/data',
    })
    expect(changes.map((c) => c.op)).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'volume', 'data', 'destination'],
      value: '/data',
    })
  })

  // Cancelling creation after drafting nested entries must not leave
  // anything orphaned in the pending changes list - the whole point
  // of buffering in local state instead of queuing immediately.
  it('queues nothing at all when Cancel is clicked after drafting a nested entry', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ContainersPage />)
    await screen.findByText('web')

    await user.click(screen.getByRole('button', { name: /\+ new container/i }))
    await user.type(screen.getByLabelText(/^name/i), 'cache')
    await user.type(screen.getByLabelText(/^image/i), 'redis:7')

    await user.click(screen.getByRole('button', { name: /\+ add volume mount/i }))
    await user.type(screen.getByPlaceholderText('name'), 'data')
    await user.click(screen.getByRole('button', { name: /^add volume mount$/i }))

    const form = screen.getByText('New container').closest('div.rounded-xl')
    if (!form) throw new Error('create form not found')
    await user.click(within(form as HTMLElement).getByRole('button', { name: /^cancel$/i }))

    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
  })

  // This test deliberately exercises all ten nested areas in
  // sequence (proving the whole point of this feature: everything
  // queued in one commit, nothing prematurely) - a longer default
  // timeout than the rest of this file needs, especially under full-
  // suite parallel load where individual test wall-clock time can
  // balloon well past what it takes running this file in isolation.
  it('creates a container with entries in every nested area, all queued in one commit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ContainersPage />)
    await screen.findByText('web')

    await user.click(screen.getByRole('button', { name: /\+ new container/i }))
    await user.type(screen.getByLabelText(/^name/i), 'cache')
    await user.type(screen.getByLabelText(/^image/i), 'redis:7')

    async function section(title: string) {
      const el = screen.getByText(title).closest('div')
      if (!el) throw new Error(`${title} section not found`)
      return within(el as HTMLElement)
    }

    // DNS name servers (ChipList)
    const dns = await section('DNS name servers')
    await user.type(dns.getByPlaceholderText('8.8.8.8'), '1.1.1.1')
    await user.click(dns.getByRole('button', { name: 'Add' }))

    // Network attachments (references the already-existing NET01)
    const netAttach = await section('Network attachments')
    await user.click(netAttach.getByRole('button', { name: /\+ attach network/i }))
    await user.selectOptions(netAttach.getByRole('combobox'), 'NET01')
    await user.click(netAttach.getByRole('button', { name: /^attach$/i }))

    // Port mappings
    const ports = await section('Port mappings')
    await user.click(ports.getByRole('button', { name: /\+ add port mapping/i }))
    await user.type(ports.getByPlaceholderText('name'), 'http')
    await user.type(ports.getByPlaceholderText('source port'), '8080')
    await user.type(ports.getByPlaceholderText('destination port'), '80')
    await user.click(ports.getByRole('button', { name: /^add port mapping$/i }))

    // Volume mounts
    const volumes = await section('Volume mounts')
    await user.click(volumes.getByRole('button', { name: /\+ add volume mount/i }))
    await user.type(volumes.getByPlaceholderText('name'), 'data')
    await user.type(volumes.getByPlaceholderText('/config/my-app/data'), '/config/redis/data')
    await user.type(volumes.getByPlaceholderText('/container/dir'), '/data')
    await user.click(volumes.getByRole('button', { name: /^add volume mount$/i }))

    // tmpfs mounts
    const tmpfs = await section('tmpfs mounts')
    await user.click(tmpfs.getByRole('button', { name: /\+ add tmpfs mount/i }))
    await user.type(tmpfs.getByPlaceholderText('name'), 'scratch')
    await user.type(tmpfs.getByPlaceholderText('/container/dir'), '/tmp')
    await user.click(tmpfs.getByRole('button', { name: /^add tmpfs mount$/i }))

    // Devices
    const devices = await section('Devices')
    await user.click(devices.getByRole('button', { name: /\+ add device/i }))
    await user.type(devices.getByPlaceholderText('name'), 'tun0')
    await user.type(devices.getByPlaceholderText('/dev/x (host)'), '/dev/net/tun')
    await user.click(devices.getByRole('button', { name: /^add device$/i }))

    // Environment variables (KeyValuePairList)
    const env = await section('Environment variables')
    await user.type(env.getByPlaceholderText('TZ'), 'TZ')
    await user.type(env.getByPlaceholderText('UTC'), 'UTC')
    await user.click(env.getByRole('button', { name: 'Add' }))

    // Labels (KeyValuePairList)
    const labels = await section('Labels')
    await user.type(labels.getByPlaceholderText('env'), 'env')
    await user.type(labels.getByPlaceholderText('prod'), 'prod')
    await user.click(labels.getByRole('button', { name: 'Add' }))

    // Sysctl parameters (KeyValuePairList)
    const sysctl = await section('Sysctl parameters')
    await user.type(sysctl.getByPlaceholderText('net.core.somaxconn'), 'net.core.somaxconn')
    await user.type(sysctl.getByPlaceholderText('1024'), '1024')
    await user.click(sysctl.getByRole('button', { name: 'Add' }))

    // Health check
    const healthCheck = await section('Health check')
    await user.type(healthCheck.getByPlaceholderText('command'), 'redis-cli ping')
    await user.click(healthCheck.getByRole('button', { name: /save health check/i }))

    // Nothing queued yet - all of the above only touched local draft
    // state.
    expect(usePendingChangesStore.getState().changes).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /queue container creation/i }))

    const ops = usePendingChangesStore.getState().changes.map((c) => c.op)
    expect(ops).toContainEqual({ op: 'set', path: ['container', 'name', 'cache', 'image'], value: 'redis:7' })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'name-server'],
      value: '1.1.1.1',
    })
    expect(ops).toContainEqual({ op: 'set', path: ['container', 'name', 'cache', 'network', 'NET01'] })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'port', 'http', 'source'],
      value: '8080',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'port', 'http', 'destination'],
      value: '80',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'volume', 'data', 'source'],
      value: '/config/redis/data',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'tmpfs', 'scratch', 'destination'],
      value: '/tmp',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'device', 'tun0', 'source'],
      value: '/dev/net/tun',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'environment', 'TZ', 'value'],
      value: 'UTC',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'label', 'env', 'value'],
      value: 'prod',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'sysctl', 'parameter', 'net.core.somaxconn', 'value'],
      value: '1024',
    })
    expect(ops).toContainEqual({
      op: 'set',
      path: ['container', 'name', 'cache', 'health-check', 'command'],
      value: 'redis-cli ping',
    })
  }, 20000)

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
