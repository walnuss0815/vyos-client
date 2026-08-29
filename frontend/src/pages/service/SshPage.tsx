import SshSettings from '../../components/service/SshSettings'
import { useServiceConfig } from '../../hooks/useServiceConfig'

export default function SshPage() {
  const { ssh, isLoading, isError } = useServiceConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load service configuration.</p>

  return <SshSettings config={ssh} />
}
