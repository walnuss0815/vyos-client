import RouteMapSection from '../../components/policy/RouteMapSection'
import { usePolicyConfig } from '../../hooks/usePolicyConfig'

export default function RouteMapsPage() {
  const { routeMaps, isLoading, isError } = usePolicyConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load policy configuration.</p>

  return <RouteMapSection routeMaps={routeMaps} />
}
