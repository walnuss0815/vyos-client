import TftpSettings from '../../components/service/TftpSettings'
import { useServiceConfig } from '../../hooks/useServiceConfig'

export default function TftpPage() {
  const { tftp, isLoading, isError } = useServiceConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load service configuration.</p>

  return <TftpSettings config={tftp} />
}
