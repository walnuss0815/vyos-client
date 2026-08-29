import SyslogSection from '../../components/system/SyslogSection'
import { useSystemConfig } from '../../hooks/useSystemConfig'

export default function SyslogPage() {
  const { syslog, isLoading, isError } = useSystemConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load system configuration.</p>

  return <SyslogSection syslog={syslog} />
}
