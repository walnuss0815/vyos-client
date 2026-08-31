import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { renderWithProviders } from '../test/testUtils'
import IngressPage from './IngressPage'

function mockSystemInfo(ingressEnabled: boolean) {
  server.use(
    http.get('/api/system/info', () =>
      HttpResponse.json({ hostname: 'test-router', version: '1.5', loginBanner: '', ingressEnabled }),
    ),
  )
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('IngressPage', () => {
  it('shows a disabled-state explanation when ingressEnabled is false', async () => {
    mockSystemInfo(false)
    renderWithProviders(<IngressPage />)
    expect(await screen.findByText(/ingress is disabled/i)).toBeInTheDocument()
    expect(screen.getByText('INGRESS_ENABLED=true')).toBeInTheDocument()
  })

  it('does not fetch the ingress list at all when disabled', async () => {
    mockSystemInfo(false)
    let requested = false
    server.use(
      http.get('/api/ingress', () => {
        requested = true
        return HttpResponse.json({ entries: [] })
      }),
    )
    renderWithProviders(<IngressPage />)
    await screen.findByText(/ingress is disabled/i)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(requested).toBe(false)
  })

  it('shows a placeholder when enabled but no entries exist', async () => {
    mockSystemInfo(true)
    server.use(http.get('/api/ingress', () => HttpResponse.json({ entries: [] })))
    renderWithProviders(<IngressPage />)
    expect(await screen.findByText('No ingress entries configured yet.')).toBeInTheDocument()
  })

  it('lists entries with their target URL, TLS-skip note, and header names', async () => {
    mockSystemInfo(true)
    server.use(
      http.get('/api/ingress', () =>
        HttpResponse.json({
          entries: [
            {
              name: 'nas',
              description: 'Home NAS',
              targetUrl: 'http://10.0.0.5:8080',
              headers: [{ name: 'Authorization' }],
              skipTlsVerify: true,
            },
          ],
        }),
      ),
    )
    renderWithProviders(<IngressPage />)

    expect(await screen.findByText('nas')).toBeInTheDocument()
    expect(screen.getByText('Home NAS')).toBeInTheDocument()
    expect(screen.getByText(/10\.0\.0\.5:8080/)).toBeInTheDocument()
    expect(screen.getByText(/TLS verification skipped/)).toBeInTheDocument()
    expect(screen.getByText(/Headers: Authorization/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/ingress/nas/')
  })

  it('shows an error message when the list request fails', async () => {
    mockSystemInfo(true)
    server.use(http.get('/api/ingress', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })))
    renderWithProviders(<IngressPage />)
    expect(await screen.findByText(/failed to load ingress entries/i)).toBeInTheDocument()
  })

  it('creates a new ingress entry with a header', async () => {
    const user = userEvent.setup()
    mockSystemInfo(true)
    server.use(http.get('/api/ingress', () => HttpResponse.json({ entries: [] })))
    let postedBody: unknown
    server.use(
      http.post('/api/ingress', async ({ request }) => {
        postedBody = await request.json()
        return HttpResponse.json(
          { name: 'nas', targetUrl: 'http://10.0.0.5', headers: [{ name: 'Authorization' }], skipTlsVerify: false },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<IngressPage />)
    await screen.findByText('No ingress entries configured yet.')

    await user.click(screen.getByRole('button', { name: '+ Add ingress' }))
    await user.type(screen.getByPlaceholderText('nas'), 'nas')
    await user.type(screen.getByPlaceholderText('http://10.0.0.5:8080'), 'http://10.0.0.5')
    await user.type(screen.getByPlaceholderText('header name'), 'Authorization')
    await user.type(screen.getByPlaceholderText('value'), 'Bearer secret')
    await user.click(screen.getByRole('button', { name: 'Add header' }))
    await user.click(screen.getByRole('button', { name: 'Add ingress' }))

    await waitFor(() => {
      expect(postedBody).toMatchObject({
        name: 'nas',
        targetUrl: 'http://10.0.0.5',
        headers: [{ name: 'Authorization', value: 'Bearer secret' }],
      })
    })
  })

  it('disables the create button until a name and target URL are filled in', async () => {
    const user = userEvent.setup()
    mockSystemInfo(true)
    server.use(http.get('/api/ingress', () => HttpResponse.json({ entries: [] })))
    renderWithProviders(<IngressPage />)
    await screen.findByText('No ingress entries configured yet.')

    await user.click(screen.getByRole('button', { name: '+ Add ingress' }))
    expect(screen.getByRole('button', { name: 'Add ingress' })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('nas'), 'nas')
    expect(screen.getByRole('button', { name: 'Add ingress' })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('http://10.0.0.5:8080'), 'http://10.0.0.5')
    expect(screen.getByRole('button', { name: 'Add ingress' })).not.toBeDisabled()
  })

  it('rejects an invalid name before ever calling the API', async () => {
    const user = userEvent.setup()
    mockSystemInfo(true)
    server.use(http.get('/api/ingress', () => HttpResponse.json({ entries: [] })))
    renderWithProviders(<IngressPage />)
    await screen.findByText('No ingress entries configured yet.')

    await user.click(screen.getByRole('button', { name: '+ Add ingress' }))
    await user.type(screen.getByPlaceholderText('nas'), 'NAS')
    await user.type(screen.getByPlaceholderText('http://10.0.0.5:8080'), 'http://10.0.0.5')

    expect(screen.getByText(/not a valid name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add ingress' })).toBeDisabled()
  })

  it('edits an entry, leaving an existing header value blank to keep it unchanged', async () => {
    const user = userEvent.setup()
    mockSystemInfo(true)
    server.use(
      http.get('/api/ingress', () =>
        HttpResponse.json({
          entries: [
            {
              name: 'nas',
              targetUrl: 'http://10.0.0.5',
              headers: [{ name: 'Authorization' }],
              skipTlsVerify: false,
            },
          ],
        }),
      ),
    )
    let putBody: unknown
    server.use(
      http.put('/api/ingress/nas', async ({ request }) => {
        putBody = await request.json()
        return HttpResponse.json({
          name: 'nas',
          targetUrl: 'http://10.0.0.6',
          headers: [{ name: 'Authorization' }],
          skipTlsVerify: false,
        })
      }),
    )
    renderWithProviders(<IngressPage />)
    await screen.findByText('nas')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const targetInput = screen.getByPlaceholderText('http://10.0.0.5:8080')
    await user.clear(targetInput)
    await user.type(targetInput, 'http://10.0.0.6')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(putBody).toMatchObject({
        targetUrl: 'http://10.0.0.6',
        headers: [{ name: 'Authorization', value: '' }],
      })
    })
  })

  it('deletes an entry after a second confirming click', async () => {
    const user = userEvent.setup()
    mockSystemInfo(true)
    server.use(
      http.get('/api/ingress', () =>
        HttpResponse.json({
          entries: [{ name: 'nas', targetUrl: 'http://10.0.0.5', headers: [], skipTlsVerify: false }],
        }),
      ),
    )
    let deleteCalled = false
    server.use(
      http.delete('/api/ingress/nas', () => {
        deleteCalled = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWithProviders(<IngressPage />)
    await screen.findByText('nas')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteCalled).toBe(false)
    expect(screen.getByRole('button', { name: 'Confirm delete?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm delete?' }))
    await waitFor(() => expect(deleteCalled).toBe(true))
  })
})
