import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ImagesPage from './ImagesPage'

const RUNNING_IMAGE = { name: '2025.07.16-0020-rolling', isDefaultBoot: true, isRunning: true }
const OLD_IMAGE = { name: '1.4.0', isDefaultBoot: false, isRunning: false }

beforeEach(() => {
  usePendingChangesStore.setState({ changes: [] })
  sessionStorage.clear()
})

describe('ImagesPage (System)', () => {
  it('shows a placeholder when no images are present', async () => {
    server.use(http.get('/api/system/images', () => HttpResponse.json({ images: [] })))
    renderWithProviders(<ImagesPage />)
    expect(await screen.findByText(/no system images found/i)).toBeInTheDocument()
  })

  it('lists images with their default-boot and running status', async () => {
    server.use(http.get('/api/system/images', () => HttpResponse.json({ images: [RUNNING_IMAGE, OLD_IMAGE] })))
    renderWithProviders(<ImagesPage />)

    expect(await screen.findByText('2025.07.16-0020-rolling')).toBeInTheDocument()
    expect(screen.getByText('1.4.0')).toBeInTheDocument()
    expect(screen.getAllByText('Yes')).toHaveLength(2)
  })

  it('shows an error message when the list request fails', async () => {
    server.use(http.get('/api/system/images', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<ImagesPage />)
    expect(await screen.findByText(/failed to load system images/i)).toBeInTheDocument()
  })

  it('does not show a reboot nudge when the running image is already the default boot', async () => {
    server.use(http.get('/api/system/images', () => HttpResponse.json({ images: [RUNNING_IMAGE, OLD_IMAGE] })))
    renderWithProviders(<ImagesPage />)
    await screen.findByText('2025.07.16-0020-rolling')
    expect(screen.queryByText(/reboot to switch/i)).not.toBeInTheDocument()
  })

  it('shows a reboot nudge when the default-boot image differs from the running one', async () => {
    const running = { name: '1.4.1', isDefaultBoot: false, isRunning: true }
    const defaultBoot = { name: '1.4.0', isDefaultBoot: true, isRunning: false }
    server.use(http.get('/api/system/images', () => HttpResponse.json({ images: [running, defaultBoot] })))
    renderWithProviders(<ImagesPage />)

    expect(await screen.findByText(/reboot to switch/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to power/i })).toHaveAttribute('href', '/system/power')
  })

  it('requires the acknowledgment checkbox before Install is enabled', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/system/images', () => HttpResponse.json({ images: [] })))
    renderWithProviders(<ImagesPage />)
    await screen.findByText(/no system images found/i)

    await user.type(
      screen.getByPlaceholderText(/downloads.vyos.io/i),
      'https://downloads.vyos.io/rolling/current/amd64/vyos-rolling-latest.iso',
    )
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Install' })).not.toBeDisabled()
  })

  it('nudges toward exporting the configuration before installing a new image', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/system/images', () => HttpResponse.json({ images: [] })))
    renderWithProviders(<ImagesPage />)
    await screen.findByText(/no system images found/i)

    await user.type(screen.getByPlaceholderText(/downloads.vyos.io/i), 'https://example.com/vyos.iso')

    expect(screen.getByRole('link', { name: /exporting a copy of the current configuration/i })).toHaveAttribute(
      'href',
      '/config-tree',
    )
  })

  it('installs an image and refreshes the list on success', async () => {
    const user = userEvent.setup()
    let installedUrl: string | null = null
    let listCallCount = 0
    const url = 'https://downloads.vyos.io/rolling/current/amd64/vyos-rolling-latest.iso'
    server.use(
      http.get('/api/system/images', () => {
        listCallCount++
        return HttpResponse.json({ images: listCallCount > 1 ? [RUNNING_IMAGE] : [] })
      }),
      http.post('/api/system/images', async ({ request }) => {
        const body = (await request.json()) as { url: string }
        installedUrl = body.url
        return HttpResponse.json({ message: 'installed successfully' })
      }),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText(/no system images found/i)

    await user.type(screen.getByPlaceholderText(/downloads.vyos.io/i), url)
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => expect(installedUrl).toBe(url))
    expect(await screen.findByText('installed successfully')).toBeInTheDocument()
    expect(await screen.findByText('2025.07.16-0020-rolling')).toBeInTheDocument()
  })

  it('shows an error message when the install request fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/system/images', () => HttpResponse.json({ images: [] })),
      http.post('/api/system/images', () => HttpResponse.json({ error: 'not enough disk space' }, { status: 502 })),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText(/no system images found/i)

    await user.type(screen.getByPlaceholderText(/downloads.vyos.io/i), 'https://example.com/bad.iso')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Install' }))

    expect(await screen.findByText(/not enough disk space/i)).toBeInTheDocument()
  })

  it('requires a second click on Delete to confirm, then removes the image', async () => {
    const user = userEvent.setup()
    let deleteCallCount = 0
    let deletedName: string | null = null
    server.use(
      http.get('/api/system/images', () =>
        HttpResponse.json({ images: deleteCallCount > 0 ? [RUNNING_IMAGE] : [RUNNING_IMAGE, OLD_IMAGE] }),
      ),
      http.delete('/api/system/images', ({ request }) => {
        deleteCallCount++
        deletedName = new URL(request.url).searchParams.get('name')
        return HttpResponse.json({ message: '' })
      }),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText('1.4.0')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Confirm delete?' })).toBeInTheDocument()
    expect(deleteCallCount).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Confirm delete?' }))
    await waitFor(() => expect(deleteCallCount).toBe(1))
    expect(deletedName).toBe('1.4.0')
    await waitFor(() => expect(screen.queryByText('1.4.0')).not.toBeInTheDocument())
  })

  it('shows an error message when the delete request fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/system/images', () => HttpResponse.json({ images: [RUNNING_IMAGE, OLD_IMAGE] })),
      http.delete('/api/system/images', () =>
        HttpResponse.json({ error: 'cannot delete the running image' }, { status: 502 }),
      ),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText('1.4.0')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete?' }))

    expect(await screen.findByText(/cannot delete the running image/i)).toBeInTheDocument()
  })

  it('does not offer to delete the currently-running image', async () => {
    server.use(http.get('/api/system/images', () => HttpResponse.json({ images: [RUNNING_IMAGE] })))
    renderWithProviders(<ImagesPage />)
    await screen.findByText('2025.07.16-0020-rolling')
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('queues a "set default-boot" config op and shows "Queued" instead of the button', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/system/images', () => HttpResponse.json({ images: [RUNNING_IMAGE, OLD_IMAGE] })))
    renderWithProviders(<ImagesPage />)
    await screen.findByText('1.4.0')

    await user.click(screen.getByRole('button', { name: /set as default boot/i }))

    const { changes } = usePendingChangesStore.getState()
    expect(changes).toHaveLength(1)
    expect(changes[0].op).toEqual({
      op: 'set',
      path: ['system', 'image', 'default-boot'],
      value: '1.4.0',
    })
    expect(screen.getByText('Queued')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set as default boot/i })).not.toBeInTheDocument()
  })

  it('does not offer to set the already-default-boot image as default boot', async () => {
    server.use(http.get('/api/system/images', () => HttpResponse.json({ images: [RUNNING_IMAGE] })))
    renderWithProviders(<ImagesPage />)
    await screen.findByText('2025.07.16-0020-rolling')
    expect(screen.queryByRole('button', { name: /set as default boot/i })).not.toBeInTheDocument()
  })
})
