import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ContainerImageUpdateCheck } from '../lib/vyosApi'

/** One remembered "Check for update" result for a single container. */
export interface CachedContainerImageUpdateCheck {
  result: ContainerImageUpdateCheck
  /** The exact image reference this result was checked against - a
   * cached entry is only ever shown when it still matches the
   * container's *current* `image` value (see
   * ContainerImageUpdateCheck.tsx). If the operator edits a
   * container's image after checking it, the old result no longer
   * describes anything real and must not be shown as if it does. */
  image: string
  /** `Date.now()` at the moment this result was fetched - shown to
   * the operator ("Checked at ...") so a long-remembered result is
   * never presented without an indication of how old it might be. */
  checkedAt: number
}

interface ContainerImageUpdateChecksState {
  /** Keyed by container name. */
  checks: Record<string, CachedContainerImageUpdateCheck>
  setCheck: (containerName: string, image: string, result: ContainerImageUpdateCheck) => void
  clearCheck: (containerName: string) => void
}

/**
 * Remembers the last "Check for update" result per container
 * (ContainerImageUpdateCheck.tsx) across page reloads and browser
 * restarts - backed by localStorage, the same "the user would
 * reasonably expect this to survive a restart" convention
 * useRefreshSettingsStore already uses (unlike usePendingChangesStore's
 * deliberately session-only sessionStorage).
 *
 * This does NOT introduce any new registry check of its own - it only
 * remembers the result of a check the operator already explicitly
 * triggered via the "Check for update" button. The underlying feature
 * remains "manual and on-demand only" (see docs/architecture.md's
 * "Container image update checks" section): nothing here ever causes
 * an automatic re-check, on page load or otherwise - it just stops
 * throwing away a result that already exists the moment the page
 * happens to reload.
 */
export const useContainerImageUpdateChecksStore = create<ContainerImageUpdateChecksState>()(
  persist(
    (set) => ({
      checks: {},
      setCheck: (containerName, image, result) =>
        set((state) => ({
          checks: {
            ...state.checks,
            [containerName]: { result, image, checkedAt: Date.now() },
          },
        })),
      clearCheck: (containerName) =>
        set((state) => {
          const { [containerName]: _removed, ...rest } = state.checks
          return { checks: rest }
        }),
    }),
    {
      name: 'vyos-client-container-image-update-checks',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
