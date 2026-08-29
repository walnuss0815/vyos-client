import VrrpGlobalSettings from '../../components/highavailability/VrrpGlobalSettings'
import VrrpGroupList from '../../components/highavailability/VrrpGroupList'
import VrrpStatusPanel from '../../components/highavailability/VrrpStatusPanel'
import VrrpSyncGroupList from '../../components/highavailability/VrrpSyncGroupList'
import { useHAConfig } from '../../hooks/useHAConfig'

export default function VrrpPage() {
  const { global, disabled, groups, syncGroups, isLoading, isError } = useHAConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load High Availability configuration.</p>

  return (
    <div>
      <VrrpStatusPanel />
      <VrrpGlobalSettings ha={{ disabled, global, groups, syncGroups }} />
      <VrrpGroupList groups={groups} />
      <VrrpSyncGroupList syncGroups={syncGroups} groups={groups} />
    </div>
  )
}
