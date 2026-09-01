// Applies the dark/light class before first paint, so there's no
// flash of the wrong theme. Mirrors store/theme.ts's resolveTheme()
// and reads the same localStorage key zustand's `persist` middleware
// writes to (THEME_STORAGE_KEY there) - keep both in sync if either
// changes.
//
// Extracted out of index.html into this separate static file (rather
// than an inline <script>) so the backend's Content-Security-Policy
// can use a plain `script-src 'self'` with no `'unsafe-inline'`
// exception - see backend/internal/api/security_headers.go. Referenced
// from index.html as a plain, non-module <script src="/theme-init.js">
// before the app's own module script, so it still runs synchronously
// ahead of first paint exactly as it did inline.
;(function () {
  try {
    var stored = localStorage.getItem('vyos-client-theme')
    var mode = stored ? JSON.parse(stored).state.mode : 'auto'
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    var dark = mode === 'dark' || (mode === 'auto' && prefersDark)
    if (dark) document.documentElement.classList.add('dark')
  } catch {
    // Storage disabled/corrupt/etc. - fall through to the light
    // default rather than block rendering.
  }
})()
