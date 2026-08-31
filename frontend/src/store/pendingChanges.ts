import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isSensitivePath } from '../lib/masking'
import type { ConfigOp } from '../lib/vyosApi'

export interface PendingChange {
  id: string
  op: ConfigOp
  /** Human label for display in the review/diff panel, e.g.
   * "Firewall: WAN-IN rule 10" or "system host-name". Defaults to the
   * dotted path when a page doesn't supply anything more specific. */
  label: string
}

interface PendingChangesState {
  changes: PendingChange[]
  add: (change: Omit<PendingChange, 'id'>) => void
  remove: (id: string) => void
  clear: () => void
}

/**
 * The single, shared changeset used by every editable page (Config
 * Tree, Firewall, DHCP). Nothing here is sent to the backend until the
 * user explicitly commits — this is genuinely the ONLY place edits
 * live before that point, which is what makes "no separate
 * server-side state management" true: durable configuration exists
 * only in VyOS, and in-progress edits exist only in this browser tab's
 * sessionStorage (cleared on logout, and naturally scoped to one
 * session/tab rather than shared across the app like a server-side
 * draft store would be).
 */
/** Whether `changes` contains a queued `set` for exactly `path` (not a
 * descendant/ancestor - an exact match only). Used by
 * useServiceConfig.ts/useVpnConfig.ts so a feature gated behind an
 * "Enable X" button (which queues `set <path>`) becomes immediately
 * configurable, without waiting for a commit + refetch to see it
 * reflected in the fetched config. Path comparison via `.join(' ')`,
 * the same stringification PendingChangesBar.tsx already uses for
 * display - simpler than a generic array-equality helper for the
 * short paths involved here. */
export function hasPendingSet(changes: PendingChange[], path: string[]): boolean {
  const target = path.join(' ')
  return changes.some((c) => c.op.op === 'set' && c.op.path.join(' ') === target)
}

/** The mirror of hasPendingSet: whether `changes` contains a queued
 * `delete` for exactly `path`. Used for the reverse case - a "Disable
 * X entirely" button (which queues `delete <path>`) should
 * immediately revert the UI to the "not configured" view, rather than
 * keep showing the settings form with stale values until commit. */
export function hasPendingDelete(changes: PendingChange[], path: string[]): boolean {
  const target = path.join(' ')
  return changes.some((c) => c.op.op === 'delete' && c.op.path.join(' ') === target)
}

/** Overrides `parsed.enabled` so a feature gated behind an "Enable X"/
 * "Disable X entirely" button pair (which queue `set <path>`/
 * `delete <path>` respectively) is immediately reflected in the UI,
 * without waiting for a commit + refetch. A pending delete always
 * wins over a pending set (shouldn't be possible to queue both for
 * the same exact path from the UI, but delete-wins is the safer
 * interpretation if it ever happens) and over the fetched value. */
export function withPendingEnable<T extends { enabled: boolean }>(
  parsed: T,
  path: string[],
  changes: PendingChange[],
): T {
  if (hasPendingDelete(changes, path)) return parsed.enabled ? { ...parsed, enabled: false } : parsed
  if (!parsed.enabled && hasPendingSet(changes, path)) return { ...parsed, enabled: true }
  return parsed
}

export const usePendingChangesStore = create<PendingChangesState>()(
  persist(
    (set) => ({
      changes: [],
      add: (change) =>
        set((state) => ({
          changes: [...state.changes, { ...change, id: crypto.randomUUID() }],
        })),
      remove: (id) => set((state) => ({ changes: state.changes.filter((c) => c.id !== id) })),
      clear: () => set({ changes: [] }),
    }),
    {
      name: 'vyos-client-pending-changes',
      storage: createJSONStorage(() => sessionStorage),
      // Never let a change carrying a real secret value (password,
      // PSK, private key, ... - see lib/masking.ts's shared
      // sensitive-fields.json) reach sessionStorage. Even though
      // sessionStorage is tab/session-scoped and cleared on logout,
      // it's still a browser-visible store (session restore, crash
      // recovery, some extensions can read it) with no reason to ever
      // hold a plaintext secret. This only affects what gets WRITTEN
      // to storage - the in-memory `changes` this store's own state
      // holds (what the review/diff panel and Commit actually read)
      // is untouched and keeps the real value for as long as the page
      // stays loaded. A dropped change simply won't survive a page
      // reload, requiring the user to re-queue it - a safer failure
      // mode than either persisting the real secret or silently
      // rehydrating it as a fake placeholder that could later get
      // committed as-is. A sensitive-path change with no value at all
      // (e.g. deleting a password leaf) has nothing to leak, so it's
      // kept.
      partialize: (state) => ({
        changes: state.changes.filter((c) => !c.op.value || !isSensitivePath(c.op.path)),
      }),
    },
  ),
)
