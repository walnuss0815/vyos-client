import { create } from 'zustand'
import { setSessionGenerationGetter, setUnauthorizedHandler } from '../lib/api'
import * as api from '../lib/vyosApi'
import { usePendingChangesStore } from './pendingChanges'
import { useUnsavedCommitStore } from './unsavedCommit'

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous'

// Mirrors lastUser in sessionStorage, where the pending-changes cart
// lives too, so a reload can't hand one user's queue to another.
const LAST_USER_KEY = 'vyos-client-last-user'

/** Records `user` as this tab's user, first clearing the queued changes
 * if they were made by someone else. */
function rememberUser(previous: string | null, user: string) {
  const last = previous ?? sessionStorage.getItem(LAST_USER_KEY)
  if (last !== null && last !== user) usePendingChangesStore.getState().clear()
  sessionStorage.setItem(LAST_USER_KEY, user)
}

interface SessionState {
  user: string | null
  /** The last user to authenticate in this tab; survives session
   * expiry (unlike `user`) so login can tell whether queued changes
   * belong to a different user. Cleared on logout. */
  lastUser: string | null
  status: SessionStatus
  /** Set when handleUnauthorized fires because a previously-active
   * session expired mid-use (not on an ordinary logout, and not on
   * the very first, never-authenticated page load) - LoginPage.tsx
   * reads this to show "Your session expired" instead of a bare
   * login form. Cleared on the next successful login. */
  sessionExpired: boolean
  /** Bumped every time this store establishes a new authoritative
   * "authenticated" session (checkSession's first successful probe,
   * or a successful login) - see handleUnauthorized for why. */
  generation: number
  checkSession: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Invoked by lib/api.ts's global 401 handler with the session
   * generation that was active when the *failing request* was issued
   * - see setUnauthorizedHandler's doc comment there for why this
   * lives outside TanStack Query's cache-level error hooks, and this
   * function's own doc comment for why that generation matters.
   * Idempotent and safe to call from any status. */
  handleUnauthorized: (requestGeneration: number) => void
}

/**
 * Session state is intentionally NOT the source of truth for anything
 * durable — it just mirrors whether the backend currently considers
 * this browser authenticated (via the HttpOnly session cookie). There
 * is no user profile, role list, or preference stored here or
 * anywhere else server-side; see the pending-changes store for the
 * other half of the "no server-side state" design.
 */
export const useSessionStore = create<SessionState>((set, get) => {
  setUnauthorizedHandler((requestGeneration) => get().handleUnauthorized(requestGeneration))
  setSessionGenerationGetter(() => get().generation)

  return {
    user: null,
    lastUser: null,
    status: 'unknown',
    sessionExpired: false,
    generation: 0,

    checkSession: async () => {
      try {
        const res = await api.getSession()
        // The cookie is shared between tabs, so a reload can find
        // another user signed in.
        rememberUser(get().lastUser, res.user)
        set((state) => ({
          user: res.user,
          lastUser: res.user,
          status: 'authenticated',
          generation: state.generation + 1,
        }))
      } catch {
        set({ user: null, status: 'anonymous' })
      }
    },

    login: async (username, password) => {
      const res = await api.login(username, password)
      // Changes queued by someone else must not be committed (or seen)
      // by this user.
      rememberUser(get().lastUser, res.user)
      set((state) => ({
        user: res.user,
        lastUser: res.user,
        status: 'authenticated',
        sessionExpired: false,
        generation: state.generation + 1,
      }))
    },

    logout: async () => {
      try {
        await api.logout()
      } finally {
        set({ user: null, lastUser: null, status: 'anonymous' })
        sessionStorage.removeItem(LAST_USER_KEY)
        // Any queued-but-uncommitted operations may embed raw, unmasked
        // values (e.g. a secret typed into a form but never committed).
        // Those must not survive past this session on a shared/kiosk
        // browser, or be visible to a different administrator who logs
        // in on the same tab afterward.
        usePendingChangesStore.getState().clear()
        // Committed-but-unsaved paths and values must not show to the
        // next user of a shared browser either.
        useUnsavedCommitStore.getState().markSaved()
      }
    },

    // Guards against a real race: request A goes out while session
    // generation 1 is active; the session expires and A's response is
    // still in flight when the user (e.g. from a "session expired"
    // prompt shown by a different, faster-failing request) already
    // logs back in, starting generation 2. If A's now-stale 401
    // arrived and were acted on unconditionally here, it would flip a
    // freshly, genuinely re-authenticated session straight back to
    // anonymous - logging the user out of a session that's actually
    // valid, over a request that predates it. Comparing
    // requestGeneration (captured by apiRequest before A was even
    // sent) against the CURRENT generation lets exactly that case be
    // told apart from a real, current-session expiry: only a 401 from
    // a request issued under the generation that's still active gets
    // acted on.
    handleUnauthorized: (requestGeneration) => {
      const state = get()
      if (requestGeneration !== state.generation) return
      const wasAuthenticated = state.status === 'authenticated'
      // Queued changes are kept on expiry so re-login doesn't lose
      // work; login() clears them if a different user signs in.
      set({ user: null, status: 'anonymous', sessionExpired: wasAuthenticated })
    },
  }
})
