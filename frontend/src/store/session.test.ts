import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { apiRequest } from '../lib/api'
import { server } from '../test/mocks/server'
import { usePendingChangesStore } from './pendingChanges'
import { useSessionStore } from './session'

beforeEach(() => {
  sessionStorage.clear()
  usePendingChangesStore.setState({ changes: [] })
  useSessionStore.setState({ user: null, status: 'unknown', sessionExpired: false, generation: 0 })
})

describe('useSessionStore', () => {
  it('logs in and marks the session authenticated', async () => {
    await useSessionStore.getState().login('admin', 'correct-password')
    expect(useSessionStore.getState().status).toBe('authenticated')
    expect(useSessionStore.getState().user).toBe('admin')
  })

  // Regression test: pending, uncommitted changes (which may contain
  // raw secret values typed into a form but never committed) used to
  // survive logout indefinitely in sessionStorage, because logout()
  // only reset session state and never touched the pending-changes
  // store. On a shared/kiosk browser, or if a different administrator
  // logs in on the same tab afterward, that left plaintext values
  // readable across the logout boundary.
  it('clears pending changes on logout', async () => {
    usePendingChangesStore.getState().add({
      op: { op: 'set', path: ['system', 'host-name'], value: 'r1' },
      label: 'set host-name',
    })
    expect(usePendingChangesStore.getState().changes).toHaveLength(1)

    await useSessionStore.getState().logout()

    expect(usePendingChangesStore.getState().changes).toHaveLength(0)
    expect(useSessionStore.getState().status).toBe('anonymous')
  })

  it('does not flag sessionExpired on an ordinary logout', async () => {
    useSessionStore.setState({ user: 'admin', status: 'authenticated' })
    await useSessionStore.getState().logout()
    expect(useSessionStore.getState().sessionExpired).toBe(false)
  })

  describe('handleUnauthorized', () => {
    it('flags sessionExpired and clears pending changes when a previously-authenticated session expires', () => {
      useSessionStore.setState({ user: 'admin', status: 'authenticated', generation: 0 })
      usePendingChangesStore.getState().add({
        op: { op: 'set', path: ['system', 'host-name'], value: 'r1' },
        label: 'set host-name',
      })

      useSessionStore.getState().handleUnauthorized(0)

      expect(useSessionStore.getState()).toMatchObject({ status: 'anonymous', user: null, sessionExpired: true })
      expect(usePendingChangesStore.getState().changes).toHaveLength(0)
    })

    it('does not flag sessionExpired when called from an already-anonymous/unknown state (first-load probe)', () => {
      useSessionStore.setState({ user: null, status: 'unknown', generation: 0 })
      useSessionStore.getState().handleUnauthorized(0)
      expect(useSessionStore.getState()).toMatchObject({ status: 'anonymous', sessionExpired: false })
    })

    it('is cleared by a subsequent successful login', async () => {
      useSessionStore.setState({ user: 'admin', status: 'authenticated', generation: 0 })
      useSessionStore.getState().handleUnauthorized(0)
      expect(useSessionStore.getState().sessionExpired).toBe(true)

      await useSessionStore.getState().login('admin', 'correct-password')
      expect(useSessionStore.getState().sessionExpired).toBe(false)
    })

    // Regression test for a real race: request A is issued while
    // generation 0 is active; its session expires, but before A's
    // (slow) 401 response comes back, the user has already logged
    // back in from a different, faster-failing request's "session
    // expired" prompt - starting a new generation. If A's now-stale
    // 401 were still acted on unconditionally, it would flip that
    // genuinely fresh, valid session straight back to anonymous.
    it('ignores a 401 tagged with an older generation than the one currently active', async () => {
      useSessionStore.setState({ user: 'admin', status: 'authenticated', generation: 0 })
      const staleRequestGeneration = useSessionStore.getState().generation

      // The user has since successfully logged back in, starting a
      // new generation - simulating that happening *before* request
      // A's stale 401 is handled.
      await useSessionStore.getState().login('admin', 'correct-password')
      expect(useSessionStore.getState().generation).toBeGreaterThan(staleRequestGeneration)

      useSessionStore.getState().handleUnauthorized(staleRequestGeneration)

      expect(useSessionStore.getState()).toMatchObject({
        status: 'authenticated',
        user: 'admin',
        sessionExpired: false,
      })
    })

    it('still acts on a 401 tagged with the currently active generation', () => {
      useSessionStore.setState({ user: 'admin', status: 'authenticated', generation: 3 })
      useSessionStore.getState().handleUnauthorized(3)
      expect(useSessionStore.getState()).toMatchObject({ status: 'anonymous', user: null, sessionExpired: true })
    })
  })

  it('bumps the session generation on a successful checkSession, not just login', async () => {
    const before = useSessionStore.getState().generation
    await useSessionStore.getState().checkSession()
    expect(useSessionStore.getState().generation).toBeGreaterThan(before)
  })

  it('is wired up to receive 401s from any apiRequest call, not just useSessionStore methods', async () => {
    useSessionStore.setState({ user: 'admin', status: 'authenticated' })
    server.use(http.get('/api/config/tree', () => HttpResponse.json({ error: 'not authenticated' }, { status: 401 })))

    await expect(apiRequest('/api/config/tree')).rejects.toThrow()

    expect(useSessionStore.getState()).toMatchObject({ status: 'anonymous', sessionExpired: true })
  })
})
