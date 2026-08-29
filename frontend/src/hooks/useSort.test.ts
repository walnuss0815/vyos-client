import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSort } from './useSort'

describe('useSort', () => {
  it('starts at the given default column and direction', () => {
    const { result } = renderHook(() => useSort<'name' | 'state'>('name'))
    expect(result.current.sort).toEqual({ column: 'name', direction: 'asc' })
  })

  it('respects an explicit default direction', () => {
    const { result } = renderHook(() => useSort<'name' | 'state'>('name', 'desc'))
    expect(result.current.sort).toEqual({ column: 'name', direction: 'desc' })
  })

  it('switches to a new column ascending, then flips direction on repeat clicks', () => {
    const { result } = renderHook(() => useSort<'name' | 'state'>('name'))

    act(() => result.current.toggle('state'))
    expect(result.current.sort).toEqual({ column: 'state', direction: 'asc' })

    act(() => result.current.toggle('state'))
    expect(result.current.sort).toEqual({ column: 'state', direction: 'desc' })

    act(() => result.current.toggle('state'))
    expect(result.current.sort).toEqual({ column: 'state', direction: 'asc' })
  })
})
