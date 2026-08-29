import BroadcastRelayList from '../../components/service/BroadcastRelayList'
import { useServiceConfig } from '../../hooks/useServiceConfig'

export default function BroadcastRelayPage() {
  const { broadcastRelay, isLoading, isError } = useServiceConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load service configuration.</p>

  return <BroadcastRelayList config={broadcastRelay} />
}
