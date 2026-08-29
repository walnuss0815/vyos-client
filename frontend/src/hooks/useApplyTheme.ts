import { useEffect } from 'react'
import { resolveTheme, useThemeStore } from '../store/theme'

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

/**
 * Keeps the `dark` class on <html> in sync with the user's theme
 * preference (store/theme.ts). Mounted once at the app root (App.tsx)
 * so it applies to every route, including the unauthenticated login
 * page - not just the authenticated Layout.
 *
 * In 'auto' mode this also subscribes to prefers-color-scheme changes,
 * so flipping the OS theme while the app is open updates it live
 * without a reload.
 */
export function useApplyTheme() {
  const mode = useThemeStore((s) => s.mode)

  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY)

    const apply = () => {
      const resolved = resolveTheme(mode, media.matches)
      document.documentElement.classList.toggle('dark', resolved === 'dark')
    }

    apply()

    if (mode !== 'auto') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mode])
}
