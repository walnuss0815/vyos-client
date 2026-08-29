import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeStore } from '../store/theme'
import { useApplyTheme } from './useApplyTheme'

/** Minimal MediaQueryList stand-in supporting the modern
 * addEventListener/removeEventListener API used by useApplyTheme.
 * jsdom doesn't implement matchMedia at all. */
class FakeMediaQueryList {
  matches: boolean
  private listeners = new Set<(e: { matches: boolean }) => void>()

  constructor(matches: boolean) {
    this.matches = matches
  }

  addEventListener(_type: 'change', listener: (e: { matches: boolean }) => void) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'change', listener: (e: { matches: boolean }) => void) {
    this.listeners.delete(listener)
  }

  /** Test helper: simulates the OS/browser flipping prefers-color-scheme. */
  simulateChange(matches: boolean) {
    this.matches = matches
    for (const listener of this.listeners) listener({ matches })
  }

  get listenerCount() {
    return this.listeners.size
  }
}

let media: FakeMediaQueryList

function setSystemPrefersDark(matches: boolean) {
  media = new FakeMediaQueryList(matches)
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => media),
  )
}

beforeEach(() => {
  localStorage.clear()
  useThemeStore.setState({ mode: 'auto' })
  document.documentElement.classList.remove('dark')
  setSystemPrefersDark(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
})

describe('useApplyTheme', () => {
  it('adds the dark class for mode "dark"', () => {
    useThemeStore.setState({ mode: 'dark' })
    renderHook(() => useApplyTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes the dark class for mode "light"', () => {
    document.documentElement.classList.add('dark')
    useThemeStore.setState({ mode: 'light' })
    renderHook(() => useApplyTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('follows the system preference for mode "auto"', () => {
    setSystemPrefersDark(true)
    useThemeStore.setState({ mode: 'auto' })
    renderHook(() => useApplyTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('updates live when the system preference changes while in auto mode', () => {
    setSystemPrefersDark(false)
    useThemeStore.setState({ mode: 'auto' })
    renderHook(() => useApplyTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    media.simulateChange(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('does not subscribe to system preference changes outside of auto mode', () => {
    useThemeStore.setState({ mode: 'dark' })
    renderHook(() => useApplyTheme())
    expect(media.listenerCount).toBe(0)
  })

  it('unsubscribes on unmount while in auto mode', () => {
    useThemeStore.setState({ mode: 'auto' })
    const { unmount } = renderHook(() => useApplyTheme())
    expect(media.listenerCount).toBe(1)
    unmount()
    expect(media.listenerCount).toBe(0)
  })
})
