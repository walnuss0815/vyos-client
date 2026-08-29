import DhcpRelaySettings from '../../components/service/DhcpRelaySettings'
import { useServiceConfig } from '../../hooks/useServiceConfig'

export default function DhcpRelayPage() {
  const { dhcpRelay, dhcpv6Relay, isLoading, isError } = useServiceConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load service configuration.</p>

  return <DhcpRelaySettings v4={dhcpRelay} v6={dhcpv6Relay} />
}
