import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBaselineState } from './useBaselineState'

describe('useBaselineState', () => {
  it('starts from the baseline and keeps edits across re-renders with an equal baseline', () => {
    const { result, rerender } = renderHook(({ baseline }) => useBaselineState(baseline), {
      initialProps: { baseline: { port: '22' } },
    })

    act(() => result.current[1]({ port: '2222' }))
    // A new object with the same content, as the parsers produce
    // whenever the pending-changes store changes.
    rerender({ baseline: { port: '22' } })

    expect(result.current[0]).toEqual({ port: '2222' })
  })

  it('resets to the new baseline when the server values change', () => {
    const { result, rerender } = renderHook(({ baseline }) => useBaselineState(baseline), {
      initialProps: { baseline: { port: '22' } },
    })

    act(() => result.current[1]({ port: '2222' }))
    rerender({ baseline: { port: '8022' } })

    expect(result.current[0]).toEqual({ port: '8022' })
  })
})
