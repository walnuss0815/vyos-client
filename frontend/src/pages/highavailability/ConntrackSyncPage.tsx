import ConntrackSyncSettings from '../../components/highavailability/ConntrackSyncSettings'
import ConntrackSyncStatusPanel from '../../components/highavailability/ConntrackSyncStatusPanel'
import { useHAConfig } from '../../hooks/useHAConfig'

export default function ConntrackSyncPage() {
  const { conntrackSync, syncGroups, isLoading, isError } = useHAConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load High Availability configuration.</p>

  return (
    <div>
      <ConntrackSyncStatusPanel />
      <ConntrackSyncSettings config={conntrackSync} vrrpSyncGroups={syncGroups} />
    </div>
  )
}
