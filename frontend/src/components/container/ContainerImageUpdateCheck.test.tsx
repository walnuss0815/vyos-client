import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import { useContainerImageUpdateChecksStore } from '../../store/containerImageUpdateChecks'
import ContainerImageUpdateCheck from './ContainerImageUpdateCheck'

const DISABLED = { enabled: false, currentTag: '', recognized: false, latestTag: '', updateAvailable: false, newImageRef: '' }

const UP_TO_DATE = {
  enabled: true,
  currentTag: '1.25.3',
  recognized: true,
  latestTag: '',
  updateAvailable: false,
  newImageRef: '',
}

const UNRECOGNIZED = {
  enabled: true,
  currentTag: 'latest',
  recognized: false,
  latestTag: '',
  updateAvailable: false,
  newImageRef: '',
}

const UPDATE_AVAILABLE = {
  enabled: true,
  currentTag: '1.25.3',
  recognized: true,
  latestTag: '1.26.0',
  updateAvailable: true,
  newImageRef: 'nginx:1.26.0',
}

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  localStorage.clear()
  useContainerImageUpdateChecksStore.setState({ checks: {} })
})

describe('ContainerImageUpdateCheck', () => {
  it('shows a disabled explanation after checking', async () => {
    server.use(http.post('/api/container/images/check-update', () => HttpResponse.json(DISABLED)))
    const user = userEvent.setup()
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)

    await user.click(screen.getByRole('button', { name: 'Check for update' }))
    expect(await screen.findByText(/container image update checks are disabled/i)).toBeInTheDocument()
    expect(screen.getByText('CONTAINER_UPDATE_CHECKS_ENABLED=true')).toBeInTheDocument()
  })

  it('shows an up-to-date message when there is no newer matching tag', async () => {
    server.use(http.post('/api/container/images/check-update', () => HttpResponse.json(UP_TO_DATE)))
    const user = userEvent.setup()
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)

    await user.click(screen.getByRole('button', { name: 'Check for update' }))
    expect(await screen.findByText(/up to date/i)).toBeInTheDocument()
  })

  it('shows a message when the tag is not recognized', async () => {
    server.use(http.post('/api/container/images/check-update', () => HttpResponse.json(UNRECOGNIZED)))
    const user = userEvent.setup()
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:latest" containerName="web" />)

    await user.click(screen.getByRole('button', { name: 'Check for update' }))
    expect(await screen.findByText(/isn't a recognized version tag/i)).toBeInTheDocument()
  })

  it('shows an error message when the check fails', async () => {
    server.use(http.post('/api/container/images/check-update', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    const user = userEvent.setup()
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)

    await user.click(screen.getByRole('button', { name: 'Check for update' }))
    expect(await screen.findByText('unreachable')).toBeInTheDocument()
  })

  it('offers an upgrade and queues the image change when accepted', async () => {
    server.use(
      http.post('/api/container/images/check-update', () => HttpResponse.json(UPDATE_AVAILABLE)),
      http.post('/api/container/images', async ({ request }) => {
        const body = (await request.json()) as { name: string }
        expect(body.name).toBe('nginx:1.26.0')
        return HttpResponse.json({ message: 'pulled' })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)

    await user.click(screen.getByRole('button', { name: 'Check for update' }))
    // "Check for update" is replaced by "Upgrade" once an update is
    // found, rather than the two coexisting.
    expect(await screen.findByText(/update available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check for update' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Upgrade' }))
    await screen.findByText(/pulled and queued image/i)

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['container', 'name', 'web', 'image'],
      value: 'nginx:1.26.0',
    })
  })

  it('disables Upgrade and shows a message when an image change is already queued', async () => {
    usePendingChangesStore.setState({
      changes: [
        {
          id: '1',
          op: { op: 'set', path: ['container', 'name', 'web', 'image'], value: 'nginx:1.26.0' },
          label: 'already queued',
        },
      ],
    })
    server.use(http.post('/api/container/images/check-update', () => HttpResponse.json(UPDATE_AVAILABLE)))
    const user = userEvent.setup()
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)

    await user.click(screen.getByRole('button', { name: 'Check for update' }))
    const upgradeButton = await screen.findByRole('button', { name: 'Upgrade' })
    expect(upgradeButton).toBeDisabled()
    expect(screen.getByText(/an image change is already queued/i)).toBeInTheDocument()
  })

  it('shows an error message when the pull fails, without queuing anything', async () => {
    server.use(
      http.post('/api/container/images/check-update', () => HttpResponse.json(UPDATE_AVAILABLE)),
      http.post('/api/container/images', () => HttpResponse.json({ error: 'no space left on device' }, { status: 502 })),
    )
    const user = userEvent.setup()
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)

    await user.click(screen.getByRole('button', { name: 'Check for update' }))
    await user.click(await screen.findByRole('button', { name: 'Upgrade' }))
    expect(await screen.findByText(/no space left on device/i)).toBeInTheDocument()

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(0)
  })

  it('shows a previously cached result on mount, without needing to click Check for update', () => {
    useContainerImageUpdateChecksStore.getState().setCheck('web', 'nginx:1.25.3', UPDATE_AVAILABLE)
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)

    expect(screen.getByText(/update available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check for update' })).not.toBeInTheDocument()
    expect(screen.getByText(/checked at/i)).toBeInTheDocument()
  })

  it('ignores a cached result that was checked against a different image', () => {
    useContainerImageUpdateChecksStore.getState().setCheck('web', 'nginx:1.25.3', UPDATE_AVAILABLE)
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.26.0" containerName="web" />)

    expect(screen.getByRole('button', { name: 'Check for update' })).toBeInTheDocument()
    expect(screen.queryByText(/update available/i)).not.toBeInTheDocument()
  })

  it('lets a cached result be replaced with a fresh check via Re-check', async () => {
    useContainerImageUpdateChecksStore.getState().setCheck('web', 'nginx:1.25.3', UPDATE_AVAILABLE)
    server.use(http.post('/api/container/images/check-update', () => HttpResponse.json(UP_TO_DATE)))
    const user = userEvent.setup()
    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)

    expect(screen.getByText(/update available/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Re-check' }))

    expect(await screen.findByText(/up to date/i)).toBeInTheDocument()
    expect(useContainerImageUpdateChecksStore.getState().checks.web.result).toEqual(UP_TO_DATE)
  })

  it('persists a fresh check result so it survives a remount', async () => {
    server.use(http.post('/api/container/images/check-update', () => HttpResponse.json(UPDATE_AVAILABLE)))
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)

    await user.click(screen.getByRole('button', { name: 'Check for update' }))
    await screen.findByText(/update available/i)
    unmount()

    renderWithProviders(<ContainerImageUpdateCheck image="nginx:1.25.3" containerName="web" />)
    expect(screen.getByText(/update available/i)).toBeInTheDocument()
  })
})
