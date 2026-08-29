import { useMemo, useState } from 'react'
import MakeStaticModal from './dhcp/MakeStaticModal'
import type { DHCPSharedNetwork } from '../lib/dhcpConfigTypes'
import {
  buildStaticMappingIndex,
  existingStaticMappingNames,
  findStaticMapping,
  findStaticMappingIndexed,
  subnetForLease,
} from '../lib/dhcpLeases'
import type { DHCPLease } from '../lib/vyosApi'

const STATE_COLOR: Record<string, string> = {
  active: 'text-success-500',
  expired: 'text-slate-500',
  released: 'text-slate-500',
  abandoned: 'text-danger-500',
  rejected: 'text-danger-500',
}

/** Renders live DHCP leases with a "Make static"/"Edit" action per
 * row, which opens MakeStaticModal.tsx - pre-filled from the lease
 * (or from the existing mapping, for "Edit") but editable before it
 * queues a `static-mapping` config entry for the lease's address.
 * Like every other config write in this app, the actual queuing is
 * into the shared pending-changes cart for review, not sent to VyOS
 * immediately.
 *
 * A lease already covered by a static mapping (matched by MAC - see
 * findStaticMapping) shows "Edit" instead of "Make static": VyOS's
 * lease data has no static/dynamic flag of its own, so this is the
 * only way to tell, and re-offering "Make static" for an
 * already-static lease would either recreate a mapping VyOS already
 * has (a redundant/no-op set) or, worse, look actionable when the
 * real intent is almost always to review or change the existing one.
 *
 * `showPoolColumn` defaults to true; DHCPPage sets it to false when
 * rendering one table per pool (see groupLeasesByPool), since
 * repeating the pool name in every row of an already pool-titled table
 * is redundant.
 *
 * `sharedNetworks` (optional, defaults to none) drives both the
 * "Edit" vs. "Make static" detection above and rejecting a
 * static-mapping name that already exists under the lease's subnet -
 * passing it is recommended (LeasesPage.tsx does) but not required,
 * since a caller with no DHCP config loaded yet can still let "Make
 * static" work without those two guardrails (every lease falls back
 * to "Make static" if sharedNetworks is empty). */
export default function DHCPLeasesTable({
  leases,
  showPoolColumn = true,
  sharedNetworks = [],
}: {
  leases: DHCPLease[]
  showPoolColumn?: boolean
  sharedNetworks?: DHCPSharedNetwork[]
}) {
  const [modalLease, setModalLease] = useState<DHCPLease | null>(null)
  const columnCount = showPoolColumn ? 8 : 7
  const modalMapping = modalLease ? findStaticMapping(modalLease, sharedNetworks) : undefined
  // Built once per sharedNetworks change rather than once per lease -
  // see buildStaticMappingIndex's doc comment. Only worth doing for
  // the per-row lookup below, which runs once per lease per render;
  // the single modalMapping lookup above doesn't need it.
  const mappingIndex = useMemo(() => buildStaticMappingIndex(sharedNetworks), [sharedNetworks])

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-900 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">IP Address</th>
            <th className="px-3 py-2">MAC</th>
            <th className="px-3 py-2">Hostname</th>
            <th className="px-3 py-2">State</th>
            {showPoolColumn && <th className="px-3 py-2">Pool</th>}
            <th className="px-3 py-2">Expires</th>
            <th className="px-3 py-2">Remaining</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {leases.map((lease) => {
            const mapping = findStaticMappingIndexed(lease, mappingIndex)
            return (
              <tr
                key={`${lease.ipAddress}-${lease.macAddress}`}
                className="border-t border-surface-border bg-surface-900/50 hover:bg-surface-800"
              >
                <td className="px-3 py-2 font-mono text-xs text-white">{lease.ipAddress}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{lease.macAddress}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{lease.hostname || '—'}</td>
                <td className={`px-3 py-2 font-mono text-xs ${STATE_COLOR[lease.state] ?? 'text-slate-400'}`}>
                  {lease.state}
                </td>
                {showPoolColumn && (
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{lease.pool || '—'}</td>
                )}
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{lease.leaseEnd || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">{lease.remaining || '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => setModalLease(lease)}
                    disabled={!lease.subnet}
                    title={lease.subnet ? undefined : "Couldn't determine this lease's subnet"}
                    className="text-xs text-accent-500 hover:text-accent-400 disabled:cursor-not-allowed disabled:text-slate-600"
                  >
                    {mapping ? 'Edit' : 'Make static'}
                  </button>
                </td>
              </tr>
            )
          })}
          {leases.length === 0 && (
            <tr>
              <td colSpan={columnCount} className="px-3 py-6 text-center text-sm text-slate-500">
                No active leases.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {modalLease && (
        <MakeStaticModal
          lease={modalLease}
          mapping={modalMapping}
          subnet={subnetForLease(modalLease, sharedNetworks)}
          existingNames={existingStaticMappingNames(modalLease, sharedNetworks)}
          onDone={() => setModalLease(null)}
        />
      )}
    </div>
  )
}
