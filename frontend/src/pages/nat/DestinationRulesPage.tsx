import NATRuleList from '../../components/nat/NATRuleList'
import { useNATConfig } from '../../hooks/useNATConfig'

export default function DestinationRulesPage() {
  const { destinationRules, isLoading, isError } = useNATConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load NAT configuration.</p>

  return <NATRuleList kind="destination" rules={destinationRules} isLoading={isLoading} />
}
