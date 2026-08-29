import { useSort } from '../hooks/useSort'
import { compareNumbers, compareStrings, sortRows } from '../lib/sortable'
import type { NetworkInterface } from '../lib/vyosApi'
import SortableHeader from './SortableHeader'

const STATE_COLOR: Record<string, string> = {
  up: 'text-success-500',
  down: 'text-danger-500',
}

type SortColumn = 'name' | 'state' | 'mac' | 'mtu' | 'description'

const COMPARATORS: Record<SortColumn, (a: NetworkInterface, b: NetworkInterface) => number> = {
  name: (a, b) => compareStrings(a.name, b.name),
  state: (a, b) => compareStrings(a.operState, b.operState),
  mac: (a, b) => compareStrings(a.mac ?? '', b.mac ?? ''),
  mtu: (a, b) => compareNumbers(a.mtu, b.mtu),
  description: (a, b) => compareStrings(a.description ?? '', b.description ?? ''),
}

/** Renders live interface state (MAC, addresses, MTU, link state).
 * Shared by the Dashboard preview (sliced to the first 10) and the
 * full Interfaces page - kept as one component so both stay visually
 * consistent and a future column change only needs to happen once.
 * Sortable by every scalar column (not Addresses, which is
 * array-valued); sort state is local and resets on remount, defaults
 * to Name ascending. */
export default function InterfacesTable({ interfaces }: { interfaces: NetworkInterface[] }) {
  const { sort, toggle } = useSort<SortColumn>('name')
  const sorted = sortRows(interfaces, sort.direction, COMPARATORS[sort.column])

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-900 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <SortableHeader
              label="Interface"
              active={sort.column === 'name'}
              direction={sort.direction}
              onClick={() => toggle('name')}
            />
            <SortableHeader
              label="State"
              active={sort.column === 'state'}
              direction={sort.direction}
              onClick={() => toggle('state')}
            />
            <SortableHeader
              label="MAC"
              active={sort.column === 'mac'}
              direction={sort.direction}
              onClick={() => toggle('mac')}
            />
            <th className="px-3 py-2">Addresses</th>
            <SortableHeader
              label="MTU"
              active={sort.column === 'mtu'}
              direction={sort.direction}
              onClick={() => toggle('mtu')}
            />
            <SortableHeader
              label="Description"
              active={sort.column === 'description'}
              direction={sort.direction}
              onClick={() => toggle('description')}
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((iface) => (
            <tr
              key={iface.name}
              className="border-t border-surface-border bg-surface-900/50 hover:bg-surface-800"
            >
              <td className="px-3 py-2 font-mono text-xs text-white">{iface.name}</td>
              <td className="px-3 py-2 font-mono text-xs">
                <span className={STATE_COLOR[iface.operState] ?? 'text-slate-400'}>{iface.operState}</span>
                {iface.adminState !== iface.operState && (
                  <span className="ml-1 text-slate-500">(admin: {iface.adminState})</span>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">{iface.mac || '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">
                {iface.addresses.length > 0 ? (
                  <ul className="space-y-0.5">
                    {iface.addresses.map((a) => (
                      <li key={`${a.family}-${a.address}`}>
                        {a.address}/{a.prefixLen}
                        {a.scope !== 'global' && <span className="ml-1 text-slate-600">({a.scope})</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">{iface.mtu}</td>
              <td className="px-3 py-2 text-xs text-slate-400">{iface.description || '—'}</td>
            </tr>
          ))}
          {interfaces.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                No interfaces found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
