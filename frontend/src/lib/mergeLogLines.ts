/**
 * Merges a freshly-polled "last N lines" log snapshot onto a
 * previously-displayed one, for the Logs page's auto-poll mode.
 *
 * VyOS's `show log ...` commands have no `--since`/incremental fetch
 * mode at all (see docs/architecture.md) - every poll re-fetches the
 * same bounded "last N lines" window from scratch. Since that window
 * slides forward in time, the new snapshot's beginning normally
 * overlaps with the end of what's already displayed; this finds the
 * longest such overlap (the longest suffix of `previous` that equals a
 * prefix of `next`) and appends only what comes after it, so auto-poll
 * reads like a live-appending tail instead of the view jumping/
 * flickering on every poll.
 *
 * If no overlap is found at all - the log moved on further than the
 * window covers (a burst of activity, or the window/source just
 * changed), or this is the very first fetch - there's nothing
 * meaningful to preserve, so this returns `next` wholesale.
 */
export function mergeLogLines(previous: string[], next: string[]): string[] {
  if (previous.length === 0 || next.length === 0) return next

  const overlap = longestSuffixPrefixOverlap(previous, next)
  if (overlap === 0) return next
  return [...previous, ...next.slice(overlap)]
}

// A value that can never equal a real log line - used below to
// separate the two arrays being compared without any risk of a log
// line coincidentally matching it (unlike, say, an empty string or a
// fixed marker string, which a real log line could in principle
// contain).
const SEPARATOR = Symbol('mergeLogLines-separator')

/**
 * Returns the length of the longest suffix of `previous` that exactly
 * equals a prefix of `next` (0 if none), via a single linear-time KMP
 * failure-function pass - the standard technique for finding the
 * "border" between two different sequences, computed once here
 * instead of a naive approach.
 *
 * The previous version tried every candidate overlap length from
 * longest down to 1, comparing element-by-element at each one: fast
 * when a large overlap exists (found on the very first, longest
 * candidate), but O(n^2) in the worst case - specifically when there
 * is genuinely no overlap at all (a burst of activity between polls
 * exceeded the window, the log source/window just changed, or the
 * very first fetch), the search couldn't stop early and had to retry
 * every single shorter candidate down to 1, each its own full
 * comparison. This computes the same answer (the single longest
 * border) in one O(n) pass regardless of whether a match exists,
 * without the risk a simpler "just cap the search" fix would have of
 * missing a real, large overlap in the common case (a quiet log,
 * where consecutive polls overlap almost entirely) and falling back
 * to a full, flickering redraw for a poll that didn't need one.
 */
function longestSuffixPrefixOverlap(previous: string[], next: string[]): number {
  const bound = Math.min(previous.length, next.length)
  if (bound === 0) return 0

  // Only the last `bound` lines of `previous` can ever matter - the
  // rest can't be part of any overlap with `next`, which has at most
  // `bound` lines itself. Keeping this bounded by `bound` (not
  // previous.length) matters since `previous` keeps growing across
  // polls while `next` stays a fixed-size window.
  const tailOfPrevious = previous.slice(previous.length - bound)
  const combined: (string | typeof SEPARATOR)[] = [...next, SEPARATOR, ...tailOfPrevious]

  const failure = new Array<number>(combined.length).fill(0)
  for (let i = 1; i < combined.length; i++) {
    let j = failure[i - 1]
    while (j > 0 && combined[i] !== combined[j]) {
      j = failure[j - 1]
    }
    if (combined[i] === combined[j]) j++
    failure[i] = j
  }

  // The failure value at the very end is the length of the longest
  // proper prefix of `combined` (i.e. of `next`, since SEPARATOR can
  // never be part of a match) that's also a suffix of `combined` (i.e.
  // of tailOfPrevious) - exactly the longest suffix-of-previous /
  // prefix-of-next overlap this function exists to find.
  return failure[combined.length - 1]
}
