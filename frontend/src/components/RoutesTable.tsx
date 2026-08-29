import { useSort } from '../hooks/useSort'
import { compareNumbers, compareStrings, sortRows } from '../lib/sortable'
import type { Route } from '../lib/vyosApi'
import SortableHeader from './SortableHeader'

const PROTOCOL_COLOR: Record<string, string> = {
  connected: 'text-success-500',
  static: 'text-accent-500',
  bgp: 'text-warning-500',
  ospf: 'text-warning-500',
  rip: 'text-warning-500',
}

type SortColumn = 'prefix' | 'protocol' | 'distanceMetric' | 'uptime'

const COMPARATORS: Record<SortColumn, (a: Route, b: Route) => number> = {
  prefix: (a, b) => compareStrings(a.prefix, b.prefix),
  protocol: (a, b) => compareStrings(a.protocol, b.protocol),
  // Distance and metric are shown as one combined column, so they
  // sort together too: primarily by distance, tie-broken by metric.
  distanceMetric: (a, b) => compareNumbers(a.distance, b.distance) || compareNumbers(a.metric, b.metric),
  uptime: (a, b) => compareStrings(a.uptime ?? '', b.uptime ?? ''),
}

/** Renders one routing table (a single address family's worth of
 * routes) - prefix, protocol, distance/metric, next hop(s), uptime.
 * Shared by the Dashboard preview (sliced) and the full Routes page
 * (one instance per family, since IPv4 and IPv6 routing tables are
 * conceptually separate lists, not one mixed one).
 * Sortable by every scalar column (not Next hop, which is
 * array-valued); sort state is local and resets on remount, defaults
 * to Protocol ascending. */
export default function RoutesTable({ routes }: { routes: Route[] }) {
  const { sort, toggle } = useSort<SortColumn>('protocol')
  const sorted = sortRows(routes, sort.direction, COMPARATORS[sort.column])

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-900 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <SortableHeader
              label="Prefix"
              active={sort.column === 'prefix'}
              direction={sort.direction}
              onClick={() => toggle('prefix')}
            />
            <SortableHeader
              label="Protocol"
              active={sort.column === 'protocol'}
              direction={sort.direction}
              onClick={() => toggle('protocol')}
            />
            <SortableHeader
              label="Distance/Metric"
              active={sort.column === 'distanceMetric'}
              direction={sort.direction}
              onClick={() => toggle('distanceMetric')}
            />
            <th className="px-3 py-2">Next hop</th>
            <SortableHeader
              label="Uptime"
              active={sort.column === 'uptime'}
              direction={sort.direction}
              onClick={() => toggle('uptime')}
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((route, i) => (
            <tr
              key={`${route.prefix}-${i}`}
              className="border-t border-surface-border bg-surface-900/50 hover:bg-surface-800"
            >
              <td className="px-3 py-2 font-mono text-xs text-white">
                {route.prefix}
                {route.selected && <span className="ml-1 text-success-500">*</span>}
              </td>
              <td
                className={`px-3 py-2 font-mono text-xs ${PROTOCOL_COLOR[route.protocol] ?? 'text-slate-400'}`}
              >
                {route.protocol}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">
                {route.distance}/{route.metric}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">
                {route.nexthops.length > 0 ? (
                  <ul className="space-y-0.5">
                    {route.nexthops.map((n, j) => (
                      <li key={j}>
                        {n.directlyConnected ? 'directly connected' : (n.ip ?? '—')}
                        {n.interfaceName && <span className="text-slate-600"> via {n.interfaceName}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400">{route.uptime || '—'}</td>
            </tr>
          ))}
          {routes.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                No routes found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
