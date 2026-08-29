import RefreshControl from '../../components/RefreshControl'
import RoutesTable from '../../components/RoutesTable'
import { useRoutes } from '../../hooks/useRoutes'

/** The original /routes page content, now the "Live Routes" tab
 * alongside the new "Static Routes" config tab - live IPv4/IPv6
 * routing tables, sourced from FRR via VyOS's operational data. See
 * RoutingLayout.tsx. */
export default function LiveRoutesPage() {
  const { data, isLoading, isError } = useRoutes()

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <RefreshControl />
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load routing information.</p>}

      {data && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
              IPv4 ({data.ipv4.length})
            </h2>
            <RoutesTable routes={data.ipv4} />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
              IPv6 ({data.ipv6.length})
            </h2>
            <RoutesTable routes={data.ipv6} />
          </section>
        </div>
      )}
    </div>
  )
}
