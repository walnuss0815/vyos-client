import SnmpSettings from '../../components/service/SnmpSettings'
import { useServiceConfig } from '../../hooks/useServiceConfig'

export default function SnmpPage() {
  const { snmp, isLoading, isError } = useServiceConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load service configuration.</p>

  return <SnmpSettings config={snmp} />
}
