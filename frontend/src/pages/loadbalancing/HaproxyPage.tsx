import HaproxyBackendList from '../../components/loadbalancing/HaproxyBackendList'
import HaproxyGlobalSettings from '../../components/loadbalancing/HaproxyGlobalSettings'
import HaproxyServiceList from '../../components/loadbalancing/HaproxyServiceList'
import HaproxyStatusPanel from '../../components/loadbalancing/HaproxyStatusPanel'
import { useLoadBalancingConfig } from '../../hooks/useLoadBalancingConfig'

export default function HaproxyPage() {
  const { haproxy, isLoading, isError } = useLoadBalancingConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load load-balancing configuration.</p>

  return (
    <div>
      <HaproxyStatusPanel />
      <HaproxyServiceList services={haproxy.services} backends={haproxy.backends} />
      <HaproxyBackendList backends={haproxy.backends} />
      <HaproxyGlobalSettings
        globalParameters={haproxy.globalParameters}
        globalTimeout={haproxy.globalTimeout}
        vrf={haproxy.vrf}
      />
    </div>
  )
}
