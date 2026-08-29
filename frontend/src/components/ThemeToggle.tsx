import type { ReactNode } from 'react'
import { THEME_MODES, type ThemeMode, useThemeStore } from '../store/theme'

const ICONS: Record<ThemeMode, ReactNode> = {
  light: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
      <circle cx="10" cy="10" r="3.5" />
      <path
        strokeLinecap="round"
        d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.1 4.9l-1.3 1.3M6.2 13.8l-1.3 1.3M15.1 15.1l-1.3-1.3M6.2 6.2 4.9 4.9"
      />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1Z" />
    </svg>
  ),
  auto: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-4 w-4">
      <rect x="2.5" y="4" width="15" height="10" rx="1.5" />
      <path strokeLinecap="round" d="M7 17h6M10 14v3" />
    </svg>
  ),
}

const LABELS: Record<ThemeMode, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  auto: 'Follow system theme',
}

/** Compact 3-way light/dark/auto theme switcher, shown in the sidebar
 * header next to the hostname. Preference is persisted - see
 * store/theme.ts. */
export default function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-surface-border bg-surface-800 p-0.5"
    >
      {THEME_MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-label={LABELS[m]}
          aria-pressed={mode === m}
          title={LABELS[m]}
          onClick={() => setMode(m)}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition ${
            mode === m
              ? 'bg-accent-600/20 text-accent-500'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {ICONS[m]}
        </button>
      ))}
    </div>
  )
}
