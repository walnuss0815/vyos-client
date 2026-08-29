import WanGlobalSettings from '../../components/loadbalancing/WanGlobalSettings'
import WanInterfaceHealthList from '../../components/loadbalancing/WanInterfaceHealthList'
import WanRuleList from '../../components/loadbalancing/WanRuleList'
import WanStatusPanel from '../../components/loadbalancing/WanStatusPanel'
import { useLoadBalancingConfig } from '../../hooks/useLoadBalancingConfig'

export default function WanPage() {
  const { wan, isLoading, isError } = useLoadBalancingConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load load-balancing configuration.</p>

  return (
    <div>
      <WanStatusPanel />
      <WanGlobalSettings wan={wan} />
      <WanInterfaceHealthList interfaceHealth={wan.interfaceHealth} />
      <WanRuleList rules={wan.rules} />
    </div>
  )
}
