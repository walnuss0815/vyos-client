import { http, HttpResponse } from 'msw'

/**
 * Default mock handlers for the backend-for-frontend API, used by
 * component tests. Individual tests can override these with
 * server.use(...) for specific scenarios (e.g. login failure).
 */
export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string }
    if (body.username === 'admin' && body.password === 'correct-password') {
      return HttpResponse.json(
        { user: 'admin' },
        {
          headers: {
            'Set-Cookie': 'vyos_client_csrf=test-csrf-token; Path=/',
          },
        },
      )
    }
    return HttpResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }),

  http.get('/api/auth/session', () => {
    return HttpResponse.json({ user: 'admin' })
  }),

  http.post('/api/auth/logout', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/config/tree', () => {
    return HttpResponse.json({
      data: {
        system: {
          'host-name': 'test-router',
        },
      },
    })
  }),

  http.get('/api/config/set-commands', () => {
    return HttpResponse.json({ text: "set system host-name 'test-router'\n" })
  }),

  http.post('/api/config/commit', () => {
    return HttpResponse.json({ pendingConfirm: false })
  }),

  http.post('/api/config/commit/confirm', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/config/save', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('/api/config/import', () => {
    return HttpResponse.json({ pendingConfirm: false })
  }),

  http.get('/api/system/info', () => {
    return HttpResponse.json({ hostname: 'test-router', version: '1.5-rolling', loginBanner: '' })
  }),

  http.get('/api/system/resources', () => {
    return HttpResponse.json({
      uptime: { uptime: '1d 2h 3m', load1: 5, load5: 3, load15: 1 },
      cpu: { cores: 4, model: 'Test CPU' },
      memory: { totalBytes: 4 * 1024 ** 3, freeBytes: 2 * 1024 ** 3, usedBytes: 2 * 1024 ** 3 },
      storage: {
        filesystem: '/dev/sda1',
        sizeBytes: 10 * 1024 ** 3,
        usedBytes: 5 * 1024 ** 3,
        availBytes: 5 * 1024 ** 3,
      },
    })
  }),

  http.get('/api/interfaces', () => {
    return HttpResponse.json({ interfaces: [] })
  }),

  http.get('/api/routes', () => {
    return HttpResponse.json({ ipv4: [], ipv6: [] })
  }),

  http.get('/api/dhcp/leases', () => {
    return HttpResponse.json({ leases: [] })
  }),

  http.get('/api/logs', () => {
    return HttpResponse.json({ lines: [], truncated: false })
  }),

  // ContainerForm's ImagePullPrompt (see ContainerForm.tsx) fetches
  // this on every render to cross-reference the typed image field -
  // default to "nothing pulled yet" so tests that don't care about
  // the pull-prompt feature don't need their own handler.
  http.get('/api/container/images', () => {
    return HttpResponse.json({ images: [] })
  }),

  // CertificateList.tsx/CAList.tsx (see ExpiryBadge.tsx) fetch this on
  // every render - default to "nothing to show" so tests that don't
  // care about expiry badges don't need their own handler.
  http.get('/api/pki/expiry', () => {
    return HttpResponse.json({ certificates: [], cas: [] })
  }),

  // Layout.tsx's Ingress nav group only fetches this when
  // ingressEnabled is true (see useIngresses.ts) - default handler for
  // the rare test that does, so it doesn't need its own if it isn't
  // exercising ingress entries specifically.
  http.get('/api/ingress', () => {
    return HttpResponse.json({ entries: [] })
  }),
]
