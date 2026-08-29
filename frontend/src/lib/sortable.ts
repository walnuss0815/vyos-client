export type SortDirection = 'asc' | 'desc'

export interface SortState<K extends string> {
  column: K
  direction: SortDirection
}

/**
 * The next sort state when a column header is clicked: switching to a
 * different column starts it ascending; clicking the already-active
 * column flips its direction. Sort state is intentionally ephemeral
 * (not persisted) - it's just local component state, see useSort.
 */
export function nextSortState<K extends string>(current: SortState<K>, column: K): SortState<K> {
  if (current.column !== column) return { column, direction: 'asc' }
  return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

/** Sorts a *copy* of `rows` (the input array is never mutated) using
 * `compare` for ascending order, reversing the result for descending. */
export function sortRows<T>(rows: T[], direction: SortDirection, compare: (a: T, b: T) => number): T[] {
  const sorted = [...rows].sort(compare)
  return direction === 'asc' ? sorted : sorted.reverse()
}

/** Plain string comparison - including for IP/prefix-shaped columns,
 * which this deliberately does *not* give IP-aware numeric ordering
 * (e.g. "10.0.0.2" sorts before "10.0.0.10" the way strings do, not
 * the way IPs do). Simple and predictable; a reasonable first pass,
 * not a hard requirement - flagged as a possible future refinement. */
export function compareStrings(a: string, b: string): number {
  return a.localeCompare(b)
}

export function compareNumbers(a: number, b: number): number {
  return a - b
}
