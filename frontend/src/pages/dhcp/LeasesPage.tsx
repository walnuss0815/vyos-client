import DHCPLeasesTable from '../../components/DHCPLeasesTable'
import RefreshControl from '../../components/RefreshControl'
import { useDHCPConfig } from '../../hooks/useDHCPConfig'
import { useDHCPLeases } from '../../hooks/useDHCPLeases'
import { groupLeasesByPool } from '../../lib/dhcpLeases'

/** The original /dhcp page content, now the "Leases" tab alongside the
 * new "Networks" config tab - live DHCP leases grouped by pool. See
 * DHCPLayout.tsx.
 *
 * Also loads useDHCPConfig (the same config-tree fetch NetworksPage.tsx
 * uses) purely to pass its sharedNetworks down into DHCPLeasesTable, so
 * "Make static" can reject a name that collides with an existing
 * static mapping - see DHCPLeasesTable's own doc comment. Not treated
 * as a loading/error gate of its own: a still-loading or failed config
 * fetch just means that one collision guardrail is temporarily
 * unavailable, not that the leases table itself shouldn't render. */
export default function LeasesPage() {
  const { data: leases, isLoading, isError } = useDHCPLeases()
  const { sharedNetworks } = useDHCPConfig()
  const groups = leases ? groupLeasesByPool(leases) : []

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <RefreshControl />
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load DHCP leases.</p>}

      {leases && groups.length === 0 && <DHCPLeasesTable leases={[]} sharedNetworks={sharedNetworks} />}

      {groups.length > 0 && (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.pool}>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
                {group.pool} ({group.leases.length})
              </h2>
              <DHCPLeasesTable leases={group.leases} showPoolColumn={false} sharedNetworks={sharedNetworks} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
