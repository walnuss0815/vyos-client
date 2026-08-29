import { useState } from 'react'
import OSPFAreaList from '../../components/ospf/OSPFAreaList'
import OSPFGlobalSettings from '../../components/ospf/OSPFGlobalSettings'
import OSPFInterfaceList from '../../components/ospf/OSPFInterfaceList'
import OSPFRedistribution from '../../components/ospf/OSPFRedistribution'
import { useOSPFConfig } from '../../hooks/useOSPFConfig'
import type { OSPFProtocol } from '../../lib/ospfTypes'

const PROTOCOL_TABS: { protocol: OSPFProtocol; label: string }[] = [
  { protocol: 'ospf', label: 'OSPFv2 (IPv4)' },
  { protocol: 'ospfv3', label: 'OSPFv3 (IPv6)' },
]

/** OSPFv2 and OSPFv3 are separate FRR processes with separate config
 * trees (see ospfTypes.ts's doc comment) - this page switches between
 * them via a protocol sub-tab, reusing the exact same components
 * (parametrized by `protocol`) for both, since their schemas overlap
 * heavily. */
export default function OSPFPage() {
  const [protocol, setProtocol] = useState<OSPFProtocol>('ospf')
  const { ospf, ospfv3, isLoading, isError } = useOSPFConfig()
  const process = protocol === 'ospf' ? ospf : ospfv3

  return (
    <div>
      <p className="mb-4 text-sm text-slate-400">
        Open Shortest Path First - areas (network enablement, stub/NSSA types, ranges,
        authentication), per-interface settings, global settings, and redistribution of other
        protocols. OSPFv2 (IPv4) and OSPFv3 (IPv6) are separate processes with their own config,
        switched via the tabs below. Advanced options (virtual links, segment routing, MPLS-TE,
        static NBMA neighbors, LDP-sync, ABR tuning, graceful restart, route-map/ACL filtering,
        ...) aren't covered here and are still editable via the Config Tree page.
      </p>

      <div className="mb-6 flex gap-1 rounded-lg border border-surface-border bg-surface-900 p-1 text-xs">
        {PROTOCOL_TABS.map((t) => (
          <button
            key={t.protocol}
            onClick={() => setProtocol(t.protocol)}
            className={`rounded px-3 py-1.5 font-medium ${
              protocol === t.protocol ? 'bg-accent-600 text-white' : 'text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load OSPF configuration.</p>}

      {!isLoading && !isError && (
        // Keyed by protocol: several child components (OSPFGlobalSettings
        // most notably) keep protocol-specific local draft/UI state that
        // must not survive a tab switch - remounting on protocol change
        // is simpler and safer than threading reset logic through each one.
        <div key={protocol} className="space-y-6">
          <OSPFGlobalSettings protocol={protocol} settings={process.global} />
          <OSPFAreaList protocol={protocol} areas={process.areas} isLoading={isLoading} />
          <OSPFInterfaceList protocol={protocol} interfaces={process.interfaces} isLoading={isLoading} />
          <OSPFRedistribution protocol={protocol} redistributions={process.redistributions} />
        </div>
      )}
    </div>
  )
}
