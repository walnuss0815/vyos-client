import NATStaticRuleList from '../../components/nat/NATStaticRuleList'
import { useNATConfig } from '../../hooks/useNATConfig'

export default function StaticRulesPage() {
  const { staticRules, isLoading, isError } = useNATConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load NAT configuration.</p>

  return <NATStaticRuleList rules={staticRules} isLoading={isLoading} />
}
