import type { SortDirection } from '../lib/sortable'

/** A clickable `<th>` for a sortable column - shows an ascending/
 * descending indicator when it's the active sort column. Used
 * alongside plain `<th>`s for non-sortable, array-valued columns
 * (Addresses, Next hop) that this deliberately doesn't wrap. */
export default function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction: SortDirection
  onClick: () => void
}) {
  return (
    <th className="px-3 py-2" aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 uppercase tracking-wide ${
          active ? 'text-slate-200' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        {label}
        <span className="w-2.5 text-[10px] leading-none" aria-hidden="true">
          {active ? (direction === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  )
}
