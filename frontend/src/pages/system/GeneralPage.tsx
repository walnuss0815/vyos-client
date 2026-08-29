import SystemGeneralSettings from '../../components/system/SystemGeneralSettings'
import StaticHostMappingList from '../../components/system/StaticHostMappingList'
import { useSystemConfig } from '../../hooks/useSystemConfig'

export default function GeneralPage() {
  const { general, staticHostMappings, isLoading, isError } = useSystemConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load system configuration.</p>

  return (
    <div className="space-y-6">
      <SystemGeneralSettings settings={general} />
      <StaticHostMappingList mappings={staticHostMappings} />
    </div>
  )
}
