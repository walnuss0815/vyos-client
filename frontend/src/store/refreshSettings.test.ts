import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRefetchInterval, useRefreshSettingsStore } from './refreshSettings'

beforeEach(() => {
  localStorage.clear()
  useRefreshSettingsStore.setState({ enabled: true, intervalSeconds: 30 })
})

describe('useRefreshSettingsStore', () => {
  it('defaults to enabled with a 30 second interval', () => {
    const { enabled, intervalSeconds } = useRefreshSettingsStore.getState()
    expect(enabled).toBe(true)
    expect(intervalSeconds).toBe(30)
  })

  it('updates and persists the enabled flag', () => {
    useRefreshSettingsStore.getState().setEnabled(false)
    expect(useRefreshSettingsStore.getState().enabled).toBe(false)

    const raw = localStorage.getItem('vyos-client-refresh-settings')
    expect(raw).toBeTruthy()
    expect(raw).toContain('"enabled":false')
  })

  it('updates the interval', () => {
    useRefreshSettingsStore.getState().setIntervalSeconds(60)
    expect(useRefreshSettingsStore.getState().intervalSeconds).toBe(60)
  })
})

describe('useRefetchInterval', () => {
  it('returns the interval in milliseconds when enabled', () => {
    useRefreshSettingsStore.setState({ enabled: true, intervalSeconds: 15 })
    const { result } = renderHook(() => useRefetchInterval())
    expect(result.current).toBe(15000)
  })

  it('returns false when disabled, regardless of the configured interval', () => {
    useRefreshSettingsStore.setState({ enabled: false, intervalSeconds: 60 })
    const { result } = renderHook(() => useRefetchInterval())
    expect(result.current).toBe(false)
  })
})
