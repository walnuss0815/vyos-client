import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const THEME_MODES = ['light', 'dark', 'auto'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

/** The localStorage key zustand's `persist` middleware writes to. Also
 * hardcoded (it can't import this constant) in the no-FOUC script in
 * public/theme-init.js - keep the two in sync if this ever changes. */
export const THEME_STORAGE_KEY = 'vyos-client-theme'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

/**
 * The user's theme preference: 'light', 'dark', or 'auto' (the
 * default - follows the OS/browser's prefers-color-scheme, and keeps
 * following it live if that changes while the app is open). See
 * hooks/useApplyTheme.ts for where this is turned into the `dark`
 * class on <html> that index.css's palette overrides key off of, and
 * public/theme-init.js for the script (referenced from index.html,
 * not inline - see security_headers.go's Content-Security-Policy)
 * that applies it before first paint so switching themes (or an
 * OS-level scheme change) never flashes the wrong palette on load.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'auto',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/** Resolves a theme mode to the concrete appearance to render. */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): 'light' | 'dark' {
  return mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
}
