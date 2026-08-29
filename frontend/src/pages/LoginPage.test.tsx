import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { renderWithProviders } from '../test/testUtils'
import { useSessionStore } from '../store/session'
import LoginPage from './LoginPage'

beforeEach(() => {
  useSessionStore.setState({ user: null, status: 'unknown', sessionExpired: false })
})

function renderLoginPage() {
  return renderWithProviders(<LoginPage />)
}

describe('LoginPage', () => {
  it('logs in successfully with correct credentials', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'correct-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(useSessionStore.getState().status).toBe('authenticated')
    })
    expect(useSessionStore.getState().user).toBe('admin')
  })

  it('shows an error for wrong credentials', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid username or password/i)
    expect(useSessionStore.getState().status).toBe('unknown')
  })

  // Regression test: a fetch failure before any response is received
  // (backend unreachable, DNS failure, TLS error) throws a plain
  // TypeError, not an ApiError - it used to fall into the same
  // "Invalid username or password" branch as genuinely wrong
  // credentials, which is actively misleading when the real problem is
  // that the backend can't be reached at all.
  it('shows a distinct message for a network error (backend unreachable)', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.error()))
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'whatever')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to reach the server/i)
  })

  // Regression test: a genuine backend error (500) also used to be
  // misreported as "Invalid username or password", even though the
  // backend was reached and the credentials were never actually
  // checked.
  it('shows a distinct message for an unexpected server error (500)', async () => {
    server.use(
      http.post('/api/auth/login', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    )
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'whatever')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent(/invalid username or password/i)
    expect(alert).toHaveTextContent(/unexpected error/i)
  })

  // Regression coverage for the AUTH_MODE=vyos-users backend-
  // unreachable case (see docs/security.md and backend's
  // auth.ErrAuthBackendUnavailable): must not be reported as
  // "invalid username or password", since the credentials themselves
  // were never actually checked.
  it('shows a distinct message when VyOS is unreachable (503)', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'unable to verify credentials right now' }, { status: 503 }),
      ),
    )
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/username/i), 'alice')
    await user.type(screen.getByLabelText(/password/i), 'whatever')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent(/invalid username or password/i)
    expect(alert).toHaveTextContent(/unable to verify credentials/i)
  })

  it('shows a rate-limit specific message on 429', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'too many attempts' }, { status: 429 }),
      ),
    )
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'whatever')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many failed attempts/i)
  })

  // GET /api/system/info is intentionally unauthenticated (unlike
  // every other data endpoint) specifically so the login page can show
  // the router's real hostname instead of the generic "vyos-client"
  // product name - see backend/internal/api/system_handlers.go's
  // handleSystemInfo doc comment.
  it("shows the router's hostname once it loads", async () => {
    server.use(
      http.get('/api/system/info', () =>
        HttpResponse.json({ hostname: 'my-router', version: '1.5' }),
      ),
    )
    renderLoginPage()
    expect(await screen.findByRole('heading', { name: 'my-router' })).toBeInTheDocument()
    expect(screen.queryByText('vyos-client')).not.toBeInTheDocument()
  })

  it('shows a permanent "VyOS Client" brand label above the hostname heading', async () => {
    server.use(
      http.get('/api/system/info', () =>
        HttpResponse.json({ hostname: 'my-router', version: '1.5' }),
      ),
    )
    renderLoginPage()
    await screen.findByRole('heading', { name: 'my-router' })
    expect(screen.getByText('VyOS Client')).toBeInTheDocument()
  })

  it('shows a "session expired" message when sessionExpired is set', () => {
    useSessionStore.setState({ sessionExpired: true })
    renderLoginPage()
    expect(screen.getByRole('alert')).toHaveTextContent(/session expired/i)
  })

  it('does not show a "session expired" message on an ordinary (first) visit', () => {
    renderLoginPage()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the "session expired" message once logged in', async () => {
    useSessionStore.setState({ sessionExpired: true })
    const user = userEvent.setup()
    renderLoginPage()
    expect(screen.getByRole('alert')).toHaveTextContent(/session expired/i)

    await user.type(screen.getByLabelText(/username/i), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'correct-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(useSessionStore.getState().sessionExpired).toBe(false)
    })
  })

  it('shows the default title while the hostname is loading', () => {
    server.use(http.get('/api/system/info', () => new Promise(() => {})))
    renderLoginPage()
    expect(screen.getByRole('heading', { name: 'VyOS Client' })).toBeInTheDocument()
  })

  it('falls back to the default title if the hostname query fails', async () => {
    server.use(
      http.get('/api/system/info', () => HttpResponse.json({ error: 'unreachable' }, { status: 502 })),
    )
    renderLoginPage()
    // Give the (failed) query a tick to settle, then confirm it's
    // still showing the fallback, not "undefined" or a blank heading.
    await waitFor(() => {
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'VyOS Client' })).toBeInTheDocument()
  })
})
