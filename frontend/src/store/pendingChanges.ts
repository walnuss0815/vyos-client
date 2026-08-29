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
