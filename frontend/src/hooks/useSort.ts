import { useState } from 'react'
import { nextSortState, type SortDirection, type SortState } from '../lib/sortable'

/**
 * Local (not persisted - resets on remount/navigation) click-to-sort
 * state for a table: which column, and which direction. Shared by
 * InterfacesTable and RoutesTable via components/SortableHeader.tsx.
 */
export function useSort<K extends string>(defaultColumn: K, defaultDirection: SortDirection = 'asc') {
  const [sort, setSort] = useState<SortState<K>>({ column: defaultColumn, direction: defaultDirection })

  function toggle(column: K) {
    setSort((current) => nextSortState(current, column))
  }

  return { sort, toggle }
}
