import MonitoringSettings from '../../components/service/MonitoringSettings'
import { useServiceConfig } from '../../hooks/useServiceConfig'

export default function MonitoringPage() {
  const { monitoring, isLoading, isError } = useServiceConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load service configuration.</p>

  return <MonitoringSettings config={monitoring} />
}
