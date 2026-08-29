import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '../test/mocks/server'
import { ApiError, apiRequest, setUnauthorizedHandler } from './api'

describe('apiRequest', () => {
  afterEach(() => {
    document.cookie = 'vyos_client_csrf=; Max-Age=0; path=/'
  })

  it('sends the CSRF header from the cookie on mutating requests', async () => {
    document.cookie = 'vyos_client_csrf=my-csrf-token; path=/'

    let receivedHeader: string | null = null
    server.use(
      http.post('/api/config/commit', ({ request }) => {
        receivedHeader = request.headers.get('X-CSRF-Token')
        return HttpResponse.json({ pendingConfirm: false })
      }),
    )

    await apiRequest('/api/config/commit', { body: { ops: [] } })
    expect(receivedHeader).toBe('my-csrf-token')
  })

  it('does not send a CSRF header on GET requests', async () => {
    let sawHeader = false
    server.use(
      http.get('/api/config/tree', ({ request }) => {
        sawHeader = request.headers.has('X-CSRF-Token')
        return HttpResponse.json({ data: null })
      }),
    )

    await apiRequest('/api/config/tree')
    expect(sawHeader).toBe(false)
  })

  it('throws ApiError with the server message on failure', async () => {
    server.use(
      http.post('/api/auth/login', () => HttpResponse.json({ error: 'invalid credentials' }, { status: 401 })),
    )

    await expect(apiRequest('/api/auth/login', { body: {} })).rejects.toMatchObject({
      status: 401,
      message: 'invalid credentials',
    } satisfies Partial<ApiError>)
  })

  it('returns undefined for 204 No Content responses', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const result = await apiRequest('/api/auth/logout', { method: 'POST' })
    expect(result).toBeUndefined()
  })
})

describe('apiRequest unauthorized handler', () => {
  afterEach(() => {
    setUnauthorizedHandler(null)
  })

  it('invokes the registered handler on a 401 from a normal endpoint', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'not authenticated' }, { status: 401 })))
    let called = false
    setUnauthorizedHandler(() => {
      called = true
    })

    await expect(apiRequest('/api/config/tree')).rejects.toBeInstanceOf(ApiError)
    expect(called).toBe(true)
  })

  it('does not invoke the handler for a 401 from /api/auth/login', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.json({ error: 'invalid credentials' }, { status: 401 })))
    let called = false
    setUnauthorizedHandler(() => {
      called = true
    })

    await expect(apiRequest('/api/auth/login', { body: {} })).rejects.toBeInstanceOf(ApiError)
    expect(called).toBe(false)
  })

  it('does not invoke the handler for a 401 from the initial session probe', async () => {
    server.use(http.get('/api/auth/session', () => HttpResponse.json({ error: 'not authenticated' }, { status: 401 })))
    let called = false
    setUnauthorizedHandler(() => {
      called = true
    })

    await expect(apiRequest('/api/auth/session')).rejects.toBeInstanceOf(ApiError)
    expect(called).toBe(false)
  })

  it('does not invoke the handler for non-401 errors', async () => {
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
    let called = false
    setUnauthorizedHandler(() => {
      called = true
    })

    await expect(apiRequest('/api/config/tree')).rejects.toBeInstanceOf(ApiError)
    expect(called).toBe(false)
  })
})
