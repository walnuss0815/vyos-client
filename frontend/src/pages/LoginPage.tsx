import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSystemInfo } from '../hooks/useSystemInfo'
import { ApiError } from '../lib/api'
import { DEFAULT_DOCUMENT_TITLE } from '../lib/constants'
import { useSessionStore } from '../store/session'

export default function LoginPage() {
  const login = useSessionStore((s) => s.login)
  const sessionExpired = useSessionStore((s) => s.sessionExpired)
  const navigate = useNavigate()
  const systemInfoQuery = useSystemInfo()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many failed attempts. Please wait before trying again.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Invalid username or password.')
      } else if (err instanceof ApiError && err.status === 503) {
        // Distinct from "wrong credentials": the backend was reached,
        // but (when AUTH_MODE=vyos-users) it couldn't reach VyOS's own
        // API to verify them. Telling someone their password is wrong
        // when the real problem is VyOS being unreachable would send
        // them down the wrong troubleshooting path.
        setError("Unable to verify credentials right now — the router's API might be unreachable. Please try again shortly.")
      } else if (err instanceof ApiError) {
        // The backend was reached and responded, but with something
        // other than "wrong credentials" or "rate limited" (e.g. a
        // malformed request or a 500) - reporting this as "Invalid
        // username or password" would be actively misleading, since
        // the credentials were never actually the problem.
        setError('An unexpected error occurred. Please try again.')
      } else {
        // fetch() rejects with a plain (non-ApiError) exception when
        // no response is received at all - backend unreachable, DNS
        // failure, TLS error, etc. Distinct from "wrong credentials"
        // for the same reason: the real problem is connectivity, not
        // the entered password.
        setError('Unable to reach the server. Please check your connection and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">VyOS Client</p>
          <h1 className="mt-1 text-xl font-semibold text-white">
            {systemInfoQuery.data?.hostname ?? DEFAULT_DOCUMENT_TITLE}
          </h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to manage this router</p>
        </div>

        {sessionExpired && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-sm text-warning-500"
          >
            Your session expired. Please sign in again.
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-surface-border bg-surface-900 p-6 shadow-xl"
        >
          <div className="mb-4">
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-300">
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-lg border border-surface-border bg-surface-800 px-3 py-2 text-sm text-white outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-surface-border bg-surface-800 px-3 py-2 text-sm text-white outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-500"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
