import Dhcpv6ServerSettings from '../../components/service/Dhcpv6ServerSettings'
import { useServiceConfig } from '../../hooks/useServiceConfig'

export default function Dhcpv6ServerPage() {
  const { dhcpv6Server, isLoading, isError } = useServiceConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load service configuration.</p>

  return <Dhcpv6ServerSettings config={dhcpv6Server} />
}
