import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isMaskedPath } from '../lib/masking'
import type { PendingChange } from './pendingChanges'

interface UnsavedCommitState {
  /** Every change committed through this app since the last save,
   * newest last (append order, matching usePendingChangesStore's own
   * append-only `changes`). Empty means "nothing to save" - callers
   * should treat `committedChanges.length > 0` as the "there's an
   * unsaved commit" flag rather than keeping a separate boolean in
   * sync with it. */
  committedChanges: PendingChange[]
  /** Appends changes (typically the exact PendingChange[] that was
   * just committed, captured before usePendingChangesStore.clear())
   * to committedChanges - cumulative across multiple commits made
   * without an intervening save, so the shown list always reflects
   * everything currently un-saved, not just the most recent commit. */
  markCommitted: (changes: PendingChange[]) => void
  /** Clears committedChanges - called after a successful Save or
   * Rollback, and also exposed directly as a manual "Mark as saved"
   * dismiss for a flag that's gone stale (e.g. actually saved via the
   * CLI instead) - see this store's own doc comment below. */
  markSaved: () => void
}

/**
 * Tracks which commits made through this app have succeeded without a
 * subsequent Save - VyOS distinguishes "applied to the running
 * configuration" (commit) from "persisted to disk" (save), and
 * configuration that's only committed is silently lost on the next
 * reboot (see docs/architecture.md's "commit/save engine" section).
 *
 * VyOS's own REST API has no endpoint to answer "does the running
 * configuration differ from the saved one" - it exposes exactly ten
 * endpoints, none of them a config comparison, and the only way to
 * build one ourselves would mean diffing `show configuration
 * commands`'s flat set-command output against `show file
 * /config/config.boot`'s completely different curly-brace format,
 * which needs a real parser this app doesn't have. So this is
 * deliberately scoped to just what THIS app itself committed, not a
 * universal truth about the router's actual configuration state - a
 * commit made via the CLI, another session, or another browser is
 * invisible to it. PendingChangesBar.tsx's and PowerPage.tsx's copy is
 * worded accordingly ("committed... but not saved", never "your
 * configuration is unsaved"), and PowerPage.tsx's standalone Save and
 * Rollback buttons exist specifically so an operator can still act
 * proactively regardless of what this store does or doesn't know
 * about - including manually clearing a stale/incorrect state via
 * markSaved() without needing to re-save anything (e.g. after saving
 * via the CLI instead).
 *
 * Backed by localStorage - unlike usePendingChangesStore's
 * sessionStorage (deliberately tab-scoped, since a queued-but-not-yet-
 * committed change is a draft that shouldn't outlive the tab that
 * made it), this describes a real, standing fact about the router's
 * own state once a commit has actually succeeded, so it should
 * survive a reload or a full browser restart, not just navigation
 * within one tab.
 */
export const useUnsavedCommitStore = create<UnsavedCommitState>()(
  persist(
    (set) => ({
      committedChanges: [],
      markCommitted: (changes) =>
        set((state) => ({ committedChanges: [...state.committedChanges, ...changes] })),
      markSaved: () => set({ committedChanges: [] }),
    }),
    {
      name: 'vyos-client-unsaved-commit',
      storage: createJSONStorage(() => localStorage),
      // Same reasoning as usePendingChangesStore's own partialize: a
      // committed change carrying a real secret value (password, PSK,
      // private key, ...) must never reach localStorage, even though
      // it already successfully committed - localStorage is a
      // browser-visible store with no reason to ever hold a plaintext
      // secret. This only affects what gets WRITTEN to storage; the
      // in-memory committedChanges this store's own state holds (what
      // PendingChangesBar.tsx actually renders) is untouched for as
      // long as the page stays loaded. A dropped entry simply won't
      // survive a reload - the "committed but not saved" bar/list
      // will undercount after one until re-committed, a safer failure
      // mode than persisting the real secret.
      partialize: (state) => ({
        committedChanges: state.committedChanges.filter((c) => !c.op.value || !isMaskedPath(c.op.path)),
      }),
    },
  ),
)
