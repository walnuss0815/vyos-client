import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { renderWithProviders } from '../test/testUtils'
import NotificationsPage from './NotificationsPage'

const sampleNotification = {
  id: 'abc123',
  createdAt: '2024-01-01T00:00:00Z',
  severity: 'warning' as const,
  category: 'container-image-update',
  title: 'Update available',
  message: 'nginx:latest has a newer image available.',
  read: false,
}

describe('NotificationsPage', () => {
  it('shows a placeholder when there are no notifications', async () => {
    server.use(http.get('/api/notifications', () => HttpResponse.json({ notifications: [] })))
    renderWithProviders(<NotificationsPage />)
    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument()
  })

  it('lists notifications with their title, message, and category', async () => {
    server.use(http.get('/api/notifications', () => HttpResponse.json({ notifications: [sampleNotification] })))
    renderWithProviders(<NotificationsPage />)

    expect(await screen.findByText('Update available')).toBeInTheDocument()
    expect(screen.getByText('nginx:latest has a newer image available.')).toBeInTheDocument()
    expect(screen.getByText(/container-image-update/)).toBeInTheDocument()
  })

  it('shows a "New" badge and Mark read action only for unread entries', async () => {
    server.use(
      http.get('/api/notifications', () =>
        HttpResponse.json({
          notifications: [sampleNotification, { ...sampleNotification, id: 'def456', read: true, title: 'Already read' }],
        }),
      ),
    )
    renderWithProviders(<NotificationsPage />)
    await screen.findByText('Update available')

    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mark read' })).toHaveLength(1)
  })

  it('shows a "View" link when a notification has one, pointing at its link target', async () => {
    server.use(
      http.get('/api/notifications', () =>
        HttpResponse.json({ notifications: [{ ...sampleNotification, link: '/container/containers' }] }),
      ),
    )
    renderWithProviders(<NotificationsPage />)
    await screen.findByText('Update available')

    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/container/containers')
  })

  it('shows no "View" link for a notification with no link', async () => {
    server.use(http.get('/api/notifications', () => HttpResponse.json({ notifications: [sampleNotification] })))
    renderWithProviders(<NotificationsPage />)
    await screen.findByText('Update available')

    expect(screen.queryByRole('link', { name: 'View' })).not.toBeInTheDocument()
  })

  it('shows an error message when the list request fails', async () => {
    server.use(http.get('/api/notifications', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<NotificationsPage />)
    expect(await screen.findByText(/failed to load notifications/i)).toBeInTheDocument()
  })

  it('marks a single notification read and refreshes the list', async () => {
    const user = userEvent.setup()
    let readID: string | null = null
    let listCallCount = 0
    server.use(
      http.get('/api/notifications', () => {
        listCallCount++
        return HttpResponse.json({
          notifications: [{ ...sampleNotification, read: listCallCount > 1 }],
        })
      }),
      http.post('/api/notifications/read', ({ request }) => {
        readID = new URL(request.url).searchParams.get('id')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWithProviders(<NotificationsPage />)
    await user.click(await screen.findByRole('button', { name: 'Mark read' }))

    await waitFor(() => expect(readID).toBe('abc123'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark read' })).not.toBeInTheDocument())
  })

  it('dismisses a notification and refreshes the list', async () => {
    const user = userEvent.setup()
    let deletedID: string | null = null
    let listCallCount = 0
    server.use(
      http.get('/api/notifications', () => {
        listCallCount++
        return HttpResponse.json({ notifications: listCallCount > 1 ? [] : [sampleNotification] })
      }),
      http.delete('/api/notifications', ({ request }) => {
        deletedID = new URL(request.url).searchParams.get('id')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWithProviders(<NotificationsPage />)
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(deletedID).toBe('abc123'))
    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument()
  })

  it('disables "Mark all read" when there are no unread notifications', async () => {
    server.use(
      http.get('/api/notifications', () =>
        HttpResponse.json({ notifications: [{ ...sampleNotification, read: true }] }),
      ),
    )
    renderWithProviders(<NotificationsPage />)
    await screen.findByText('Update available')
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  })

  it('marks every notification read via "Mark all read"', async () => {
    const user = userEvent.setup()
    let markedAll = false
    let listCallCount = 0
    server.use(
      http.get('/api/notifications', () => {
        listCallCount++
        return HttpResponse.json({
          notifications: [{ ...sampleNotification, read: listCallCount > 1 }],
        })
      }),
      http.post('/api/notifications/read-all', () => {
        markedAll = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWithProviders(<NotificationsPage />)
    await user.click(await screen.findByRole('button', { name: 'Mark all read' }))

    await waitFor(() => expect(markedAll).toBe(true))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled())
  })
})
