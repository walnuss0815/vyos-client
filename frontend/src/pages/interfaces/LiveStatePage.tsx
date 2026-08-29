import InterfacesTable from '../../components/InterfacesTable'
import RefreshControl from '../../components/RefreshControl'
import { useInterfaces } from '../../hooks/useInterfaces'

/** The original /interfaces page content, now the "Live State" tab
 * alongside the config tabs (Ethernet/Bonding/Bridge/VRFs) - live
 * operational interface state, sourced from VyOS's own operational
 * data, not just what's configured. See InterfacesLayout.tsx. */
export default function LiveStatePage() {
  const { data: interfaces, isLoading, isError } = useInterfaces()

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <RefreshControl />
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {isError && <p className="text-sm text-danger-500">Failed to load interfaces.</p>}
      {interfaces && <InterfacesTable interfaces={interfaces} />}
    </div>
  )
}
