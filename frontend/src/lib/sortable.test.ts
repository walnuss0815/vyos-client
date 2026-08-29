import { describe, expect, it } from 'vitest'
import { compareNumbers, compareStrings, nextSortState, sortRows } from './sortable'

describe('nextSortState', () => {
  it('starts a newly-clicked column ascending', () => {
    expect(nextSortState({ column: 'name', direction: 'desc' }, 'state')).toEqual({
      column: 'state',
      direction: 'asc',
    })
  })

  it('flips the direction when the already-active column is clicked again', () => {
    expect(nextSortState({ column: 'name', direction: 'asc' }, 'name')).toEqual({
      column: 'name',
      direction: 'desc',
    })
    expect(nextSortState({ column: 'name', direction: 'desc' }, 'name')).toEqual({
      column: 'name',
      direction: 'asc',
    })
  })
})

describe('sortRows', () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }]

  it('sorts ascending without mutating the input', () => {
    const result = sortRows(rows, 'asc', (a, b) => a.n - b.n)
    expect(result.map((r) => r.n)).toEqual([1, 2, 3])
    expect(rows.map((r) => r.n)).toEqual([3, 1, 2])
  })

  it('sorts descending', () => {
    const result = sortRows(rows, 'desc', (a, b) => a.n - b.n)
    expect(result.map((r) => r.n)).toEqual([3, 2, 1])
  })
})

describe('compareStrings', () => {
  it('compares alphabetically', () => {
    expect(compareStrings('a', 'b')).toBeLessThan(0)
    expect(compareStrings('b', 'a')).toBeGreaterThan(0)
    expect(compareStrings('a', 'a')).toBe(0)
  })

  it('is a plain string comparison, not IP-aware, for IP/prefix-shaped values', () => {
    // "10.0.0.10" sorts before "10.0.0.2" alphabetically ('1' < '2'),
    // even though it's numerically larger - documenting the
    // deliberate, known limitation.
    expect(compareStrings('10.0.0.10', '10.0.0.2')).toBeLessThan(0)
  })
})

describe('compareNumbers', () => {
  it('compares numerically', () => {
    expect(compareNumbers(1, 2)).toBeLessThan(0)
    expect(compareNumbers(2, 1)).toBeGreaterThan(0)
    expect(compareNumbers(1, 1)).toBe(0)
  })
})
