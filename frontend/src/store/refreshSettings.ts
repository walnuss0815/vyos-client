import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** Selectable auto-refresh intervals for live operational data
 * (interfaces, routes). */
export const REFRESH_INTERVAL_OPTIONS = [15, 30, 60] as const
export type RefreshIntervalSeconds = (typeof REFRESH_INTERVAL_OPTIONS)[number]

interface RefreshSettingsState {
  enabled: boolean
  intervalSeconds: RefreshIntervalSeconds
  setEnabled: (enabled: boolean) => void
  setIntervalSeconds: (seconds: RefreshIntervalSeconds) => void
}

/**
 * Shared auto-refresh preference for live operational data (Dashboard,
 * Interfaces, Routes). Unlike usePendingChangesStore (deliberately
 * scoped to one tab/session via sessionStorage - see its own doc
 * comment), this is a UI preference the user would reasonably expect
 * to persist across browser sessions, so it's backed by localStorage
 * instead.
 */
export const useRefreshSettingsStore = create<RefreshSettingsState>()(
  persist(
    (set) => ({
      enabled: true,
      intervalSeconds: 30,
      setEnabled: (enabled) => set({ enabled }),
      setIntervalSeconds: (intervalSeconds) => set({ intervalSeconds }),
    }),
    {
      name: 'vyos-client-refresh-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/** The value to pass as React Query's `refetchInterval` option:
 * `false` (disabling polling entirely) when auto-refresh is off,
 * otherwise the configured interval in milliseconds. */
export function useRefetchInterval(): number | false {
  const enabled = useRefreshSettingsStore((s) => s.enabled)
  const intervalSeconds = useRefreshSettingsStore((s) => s.intervalSeconds)
  return enabled ? intervalSeconds * 1000 : false
}
