import { beforeEach, describe, expect, it } from 'vitest'
import { resolveTheme, THEME_STORAGE_KEY, useThemeStore } from './theme'

beforeEach(() => {
  localStorage.clear()
  useThemeStore.setState({ mode: 'auto' })
})

describe('useThemeStore', () => {
  it('defaults to auto', () => {
    expect(useThemeStore.getState().mode).toBe('auto')
  })

  it('updates and persists the mode', () => {
    useThemeStore.getState().setMode('dark')
    expect(useThemeStore.getState().mode).toBe('dark')

    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(raw).toContain('"mode":"dark"')
  })
})

describe('resolveTheme', () => {
  it('returns light/dark as-is regardless of system preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system preference in auto mode', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })
})
