/**
 * Thin fetch wrapper for the backend-for-frontend API.
 *
 * - Always sends credentials (session cookie).
 * - Attaches the CSRF header (read from the non-HttpOnly CSRF cookie)
 *   on every mutating request, matching the backend's double-submit
 *   CSRF check (see backend/internal/auth/middleware.go).
 * - Throws ApiError with the server's message on non-2xx responses, so
 *   callers can show it directly (VyOS's own commit-validation errors
 *   are meaningful to end users).
 */

const CSRF_COOKIE_NAME = 'vyos_client_csrf'
const CSRF_HEADER_NAME = 'X-CSRF-Token'

// Paths where a 401 means "wrong credentials" (login) or "not logged
// in yet, expected on first load" (the initial session probe) rather
// than "a previously-valid session just expired" - the global handler
// below must not fire for these, since LoginPage.tsx already handles
// login's 401 locally, and firing it for the initial checkSession()
// probe would show a bogus "session expired" message to someone who
// was never logged in.
const UNAUTHORIZED_HANDLER_EXEMPT_PATHS = ['/api/auth/login', '/api/auth/session']

let unauthorizedHandler: ((requestGeneration: number) => void) | null = null
let sessionGenerationGetter: () => number = () => 0

/**
 * Registers a single global callback invoked whenever any apiRequest
 * call (aside from the exempt paths above) receives a 401 - i.e. an
 * established session has expired or been invalidated mid-use. Wired
 * up once at app startup (see store/session.ts's subscribeToUnauthorized)
 * to flip the session store to 'anonymous' with a "session expired"
 * flag, which ProtectedRoute then reactively turns into a redirect to
 * /login - see that store for why this lives here rather than in
 * TanStack Query's QueryCache/MutationCache onError: this catches
 * every call path (queries, mutations, and direct calls alike), not
 * just ones wrapped in useQuery/useMutation.
 *
 * The handler receives the "session generation" that was current when
 * the *failing request* was issued (captured by apiRequest before the
 * fetch call, via getSessionGenerationFn below) - see
 * store/session.ts's handleUnauthorized for the stale-401 race this
 * lets it detect and ignore.
 */
export function setUnauthorizedHandler(handler: ((requestGeneration: number) => void) | null): void {
  unauthorizedHandler = handler
}

/**
 * Registers a getter for the current session generation, so apiRequest
 * can capture it per-request without this module importing from
 * store/session.ts directly (which already imports from here, via
 * setUnauthorizedHandler - importing back would be circular). Mirrors
 * setUnauthorizedHandler's registration pattern.
 */
export function setSessionGenerationGetter(getter: () => number): void {
  sessionGenerationGetter = getter
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null
}

export interface RequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, string | undefined>
}

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value)
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? (options.body ? 'POST' : 'GET')
  const headers: Record<string, string> = {}

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie(CSRF_COOKIE_NAME)
    if (csrf) headers[CSRF_HEADER_NAME] = csrf
  }

  // Captured before the request goes out, not when its response comes
  // back - a 401 must be judged against the session that was active
  // when this request was *issued*, since a later request can easily
  // complete first and start a new session generation while this one
  // is still in flight.
  const requestGeneration = sessionGenerationGetter()

  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    credentials: 'same-origin',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : undefined

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `request failed with status ${response.status}`
    if (response.status === 401 && !UNAUTHORIZED_HANDLER_EXEMPT_PATHS.includes(path)) {
      unauthorizedHandler?.(requestGeneration)
    }
    throw new ApiError(response.status, message)
  }

  return payload as T
}
