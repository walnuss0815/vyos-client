import DynamicDnsList from '../../components/service/DynamicDnsList'
import { useServiceConfig } from '../../hooks/useServiceConfig'

export default function DnsDynamicPage() {
  const { dnsDynamic, isLoading, isError } = useServiceConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load service configuration.</p>

  return <DynamicDnsList config={dnsDynamic} />
}
