import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSampleHistory } from './useSampleHistory'

describe('useSampleHistory', () => {
  it('records nothing until the first real update (dataUpdatedAt !== 0)', () => {
    const { result } = renderHook(() => useSampleHistory(0, 42))
    expect(result.current).toEqual([])
  })

  it('records nothing while the value is undefined (loading/error), even once updated', () => {
    const { result } = renderHook(() => useSampleHistory(1000, undefined))
    expect(result.current).toEqual([])
  })

  it('appends one sample per dataUpdatedAt change', () => {
    const { result, rerender } = renderHook(
      ({ t, v }: { t: number; v: number }) => useSampleHistory(t, v),
      { initialProps: { t: 1000, v: 10 } },
    )
    expect(result.current).toEqual([{ t: 1000, v: 10 }])

    rerender({ t: 2000, v: 15 })
    expect(result.current).toEqual([
      { t: 1000, v: 10 },
      { t: 2000, v: 15 },
    ])
  })

  it('still appends a new sample on an unchanged value, as long as dataUpdatedAt advanced', () => {
    const { result, rerender } = renderHook(
      ({ t, v }: { t: number; v: number }) => useSampleHistory(t, v),
      { initialProps: { t: 1000, v: 0 } },
    )
    rerender({ t: 2000, v: 0 })
    rerender({ t: 3000, v: 0 })
    expect(result.current).toEqual([
      { t: 1000, v: 0 },
      { t: 2000, v: 0 },
      { t: 3000, v: 0 },
    ])
  })

  it('does not append a duplicate sample when re-rendered with the same dataUpdatedAt', () => {
    const { result, rerender } = renderHook(
      ({ t, v }: { t: number; v: number }) => useSampleHistory(t, v),
      { initialProps: { t: 1000, v: 10 } },
    )
    rerender({ t: 1000, v: 999 }) // same timestamp - shouldn't re-fire the effect
    expect(result.current).toEqual([{ t: 1000, v: 10 }])
  })

  it('caps the history at maxSamples, dropping the oldest first', () => {
    const { result, rerender } = renderHook(
      ({ t, v }: { t: number; v: number }) => useSampleHistory(t, v, 3),
      { initialProps: { t: 1, v: 1 } },
    )
    rerender({ t: 2, v: 2 })
    rerender({ t: 3, v: 3 })
    rerender({ t: 4, v: 4 })
    expect(result.current).toEqual([
      { t: 2, v: 2 },
      { t: 3, v: 3 },
      { t: 4, v: 4 },
    ])
  })
})
