import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../test/mocks/server'
import { renderWithProviders } from '../../test/testUtils'
import ImagesPage from './ImagesPage'

const sampleImage = {
  id: 'sha256:abcdef0123456789abcdef0123456789',
  tags: ['docker.io/library/busybox:latest'],
  sizeBytes: 4194304,
  containers: 0,
  createdAt: 1700000000,
}

beforeEach(() => {
  // Default to a container config that references sampleImage's tag,
  // so the "Cleanup unused images" section (tested separately below)
  // doesn't unexpectedly render - and duplicate - image text in tests
  // that aren't about it.
  server.use(
    http.get('/api/config/tree', () =>
      HttpResponse.json({
        data: { name: { web: { image: 'docker.io/library/busybox:latest' } } },
      }),
    ),
  )
})

describe('ImagesPage', () => {
  it('shows a placeholder when no images are present', async () => {
    server.use(http.get('/api/container/images', () => HttpResponse.json({ images: [] })))
    renderWithProviders(<ImagesPage />)
    expect(await screen.findByText(/no container images have been pulled/i)).toBeInTheDocument()
  })

  it('lists images with their tags, size, and container-usage count', async () => {
    server.use(http.get('/api/container/images', () => HttpResponse.json({ images: [sampleImage] })))
    renderWithProviders(<ImagesPage />)

    expect(await screen.findByText('docker.io/library/busybox:latest')).toBeInTheDocument()
    expect(screen.getByText('sha256:abcde')).toBeInTheDocument()
    expect(screen.getByText('4.00 MB')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows an error message when the list request fails', async () => {
    server.use(http.get('/api/container/images', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<ImagesPage />)
    expect(await screen.findByText(/failed to load container images/i)).toBeInTheDocument()
  })

  it('pulls an image and refreshes the list on success', async () => {
    const user = userEvent.setup()
    let pulledName: string | null = null
    let listCallCount = 0
    server.use(
      http.get('/api/container/images', () => {
        listCallCount++
        return HttpResponse.json({ images: listCallCount > 1 ? [sampleImage] : [] })
      }),
      http.post('/api/container/images', async ({ request }) => {
        const body = (await request.json()) as { name: string }
        pulledName = body.name
        return HttpResponse.json({ message: 'pulled successfully' })
      }),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText(/no container images have been pulled/i)

    await user.type(screen.getByPlaceholderText('docker.io/library/nginx:latest'), 'docker.io/library/busybox:latest')
    await user.click(screen.getByRole('button', { name: 'Pull' }))

    await waitFor(() => expect(pulledName).toBe('docker.io/library/busybox:latest'))
    expect(await screen.findByText('pulled successfully')).toBeInTheDocument()
    expect(await screen.findByText('docker.io/library/busybox:latest')).toBeInTheDocument()
  })

  it('shows an error message when the pull request fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/container/images', () => HttpResponse.json({ images: [] })),
      http.post('/api/container/images', () => HttpResponse.json({ error: 'no such image' }, { status: 502 })),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText(/no container images have been pulled/i)

    await user.type(screen.getByPlaceholderText('docker.io/library/nginx:latest'), 'bogus:latest')
    await user.click(screen.getByRole('button', { name: 'Pull' }))

    expect(await screen.findByText(/no such image/i)).toBeInTheDocument()
  })

  it('requires a second click on Delete to confirm, then removes the image', async () => {
    const user = userEvent.setup()
    let deleteCallCount = 0
    let deletedName: string | null = null
    server.use(
      http.get('/api/container/images', () => {
        return HttpResponse.json({ images: deleteCallCount > 0 ? [] : [sampleImage] })
      }),
      http.delete('/api/container/images', ({ request }) => {
        deleteCallCount++
        deletedName = new URL(request.url).searchParams.get('name')
        return HttpResponse.json({ message: '' })
      }),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText('docker.io/library/busybox:latest')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Confirm delete?' })).toBeInTheDocument()
    expect(deleteCallCount).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Confirm delete?' }))
    await waitFor(() => expect(deleteCallCount).toBe(1))
    expect(deletedName).toBe(sampleImage.id)
    await waitFor(() => expect(screen.queryByText('docker.io/library/busybox:latest')).not.toBeInTheDocument())
  })

  it('shows an error message when the delete request fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/container/images', () => HttpResponse.json({ images: [sampleImage] })),
      http.delete('/api/container/images', () =>
        HttpResponse.json({ error: 'image is in use by a running container' }, { status: 502 }),
      ),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText('docker.io/library/busybox:latest')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete?' }))

    expect(await screen.findByText(/image is in use by a running container/i)).toBeInTheDocument()
  })

  it('flags an image not referenced by any container definition as unused, and cleans it up on confirm', async () => {
    const user = userEvent.setup()
    let deleteCallCount = 0
    server.use(
      http.get('/api/config/tree', () => HttpResponse.json({ data: {} })),
      http.get('/api/container/images', () =>
        HttpResponse.json({ images: deleteCallCount > 0 ? [] : [sampleImage] }),
      ),
      http.delete('/api/container/images', ({ request }) => {
        deleteCallCount++
        expect(new URL(request.url).searchParams.get('name')).toBe(sampleImage.id)
        return HttpResponse.json({ message: '' })
      }),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText('1 unused image')

    const cleanupBox = screen.getByText('1 unused image').closest('div.rounded-xl')
    if (!cleanupBox) throw new Error('cleanup box not found')
    expect(within(cleanupBox as HTMLElement).getByText('docker.io/library/busybox:latest')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /delete 1 unused image/i }))
    expect(screen.getByRole('button', { name: /confirm delete 1 image/i })).toBeInTheDocument()
    expect(deleteCallCount).toBe(0)

    await user.click(screen.getByRole('button', { name: /confirm delete 1 image/i }))
    await waitFor(() => expect(deleteCallCount).toBe(1))
    await waitFor(() => expect(screen.queryByText('1 unused image')).not.toBeInTheDocument())
  })

  it('does not flag an image that is referenced by a container definition as unused', async () => {
    server.use(http.get('/api/container/images', () => HttpResponse.json({ images: [sampleImage] })))
    renderWithProviders(<ImagesPage />)
    await screen.findByText('docker.io/library/busybox:latest')

    expect(screen.queryByText(/unused image/i)).not.toBeInTheDocument()
  })

  // Regression test: an earlier version of the cleanup panel only
  // checked config-tree reference, so it could recommend deleting an
  // image that a container was actually running.
  it('does not flag an image as unused if it is currently in use by a running container', async () => {
    server.use(
      http.get('/api/config/tree', () => HttpResponse.json({ data: {} })),
      http.get('/api/container/images', () =>
        HttpResponse.json({ images: [{ ...sampleImage, containers: 1 }] }),
      ),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText('docker.io/library/busybox:latest')

    expect(screen.queryByText(/unused image/i)).not.toBeInTheDocument()
  })

  it('reports per-image failures when cleaning up unused images', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('/api/config/tree', () => HttpResponse.json({ data: {} })),
      http.get('/api/container/images', () => HttpResponse.json({ images: [sampleImage] })),
      http.delete('/api/container/images', () =>
        HttpResponse.json({ error: 'image is in use by a running container' }, { status: 502 }),
      ),
    )
    renderWithProviders(<ImagesPage />)
    await screen.findByText('1 unused image')

    await user.click(screen.getByRole('button', { name: /delete 1 unused image/i }))
    await user.click(screen.getByRole('button', { name: /confirm delete 1 image/i }))

    expect(await screen.findByText(/image is in use by a running container/i)).toBeInTheDocument()
  })
})
