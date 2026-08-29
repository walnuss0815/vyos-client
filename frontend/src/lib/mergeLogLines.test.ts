import { describe, expect, it } from 'vitest'
import { mergeLogLines } from './mergeLogLines'

describe('mergeLogLines', () => {
  it('returns next wholesale when previous is empty (first fetch)', () => {
    expect(mergeLogLines([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('returns next wholesale when next is empty', () => {
    expect(mergeLogLines(['a', 'b'], [])).toEqual([])
  })

  it('appends only the genuinely new lines when the window slides forward with overlap', () => {
    const previous = ['a', 'b', 'c']
    const next = ['b', 'c', 'd', 'e']
    expect(mergeLogLines(previous, next)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('returns previous unchanged (no new lines appended) when next is identical to previous', () => {
    const previous = ['a', 'b', 'c']
    const next = ['a', 'b', 'c']
    expect(mergeLogLines(previous, next)).toEqual(['a', 'b', 'c'])
  })

  it('handles a full-window overlap (every previous line still present, one new one appended)', () => {
    const previous = ['a', 'b', 'c']
    const next = ['a', 'b', 'c', 'd']
    expect(mergeLogLines(previous, next)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('falls back to replacing wholesale when there is no overlap at all', () => {
    const previous = ['a', 'b', 'c']
    const next = ['x', 'y', 'z']
    expect(mergeLogLines(previous, next)).toEqual(['x', 'y', 'z'])
  })

  it('picks the longest possible overlap, not just any matching one', () => {
    // "b" appears twice in previous; the correct overlap is the full
    // 2-line suffix ["b", "c"], not a false shorter match on the
    // earlier "b".
    const previous = ['b', 'x', 'b', 'c']
    const next = ['b', 'c', 'd']
    expect(mergeLogLines(previous, next)).toEqual(['b', 'x', 'b', 'c', 'd'])
  })

  it('handles next being entirely a prefix-overlap subset of previous (no new lines)', () => {
    const previous = ['a', 'b', 'c', 'd']
    const next = ['c', 'd']
    expect(mergeLogLines(previous, next)).toEqual(['a', 'b', 'c', 'd'])
  })

  // Regression test for switching the overlap search from a naive
  // O(n^2) sweep (try every candidate length from longest down to 1,
  // each its own full comparison) to a single-pass KMP failure
  // function: a repeated pattern spanning the seam between the two
  // arrays is exactly the kind of input that can trip up a
  // hand-rolled border-finding implementation into either an
  // incorrect (too-short or too-long) match or an infinite loop if the
  // failure-function backtracking is wrong.
  it('finds the correct overlap even with a repeating pattern straddling the seam', () => {
    const previous = ['x', 'a', 'b', 'a', 'b', 'a', 'b']
    const next = ['a', 'b', 'a', 'b', 'c']
    // The true longest border is "a b a b" (4 lines), not the shorter
    // "a b" that a naive/incorrect implementation might settle for.
    expect(mergeLogLines(previous, next)).toEqual(['x', 'a', 'b', 'a', 'b', 'a', 'b', 'c'])
  })

  // Regression/perf test for the specific input shape that actually
  // triggers the old sweep's O(n^2) worst case: `previous` all one
  // repeated line, `next` matching for its first half then diverging -
  // every one of the (up to n) candidate overlap lengths the old code
  // tried down from the top matches for roughly the first half of the
  // comparison before failing, instead of failing immediately (i=0) or
  // succeeding immediately (the top candidate), so total work is
  // genuinely quadratic (empirically confirmed against the old
  // implementation: ~6ms at 2,000 lines, ~125ms at 16,000, scaling
  // ~n^2 as expected - not just a theoretical concern). The KMP-based
  // rewrite stays under ~10ms even at 20,000 lines (10x the largest
  // real "Lines" option, LogsPage.tsx's LINE_COUNT_OPTIONS) in the
  // same benchmark, so a 100ms budget here comfortably separates a
  // real O(n) implementation from a reintroduced O(n^2) one without
  // being flaky on slower CI hardware.
  it('stays fast on a large adversarial input that used to trigger the old O(n^2) worst case', () => {
    const size = 20_000
    const half = size / 2
    const previous = Array.from({ length: size }, () => 'a')
    const next = Array.from({ length: size }, (_, i) => (i < half ? 'a' : 'b'))

    const start = performance.now()
    const result = mergeLogLines(previous, next)
    const elapsedMs = performance.now() - start

    // The correct overlap is exactly `half`: previous's last `half`
    // lines ("a" * half) match next's first `half` lines (also all
    // "a"), but no *larger* overlap works since that would have to
    // include some of next's "b" lines, which previous has none of.
    expect(result).toEqual([...previous, ...next.slice(half)])
    expect(elapsedMs).toBeLessThan(100)
  })
})
