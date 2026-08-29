import { useState } from 'react'
import PolicyListSection from '../../components/policy/PolicyListSection'
import { usePolicyConfig } from '../../hooks/usePolicyConfig'
import type { PolicyListKind } from '../../lib/policyTypes'

const KIND_TABS: { kind: PolicyListKind; label: string }[] = [
  { kind: 'as-path', label: 'AS-Path' },
  { kind: 'community', label: 'Community' },
  { kind: 'extcommunity', label: 'Extended Community' },
  { kind: 'large-community', label: 'Large Community' },
]

const LISTS_BY_KIND = {
  'as-path': 'asPathLists',
  community: 'communityLists',
  extcommunity: 'extcommunityLists',
  'large-community': 'largeCommunityLists',
} as const

export default function ListsPage() {
  const [kind, setKind] = useState<PolicyListKind>('as-path')
  const config = usePolicyConfig()

  if (config.isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (config.isError) return <p className="text-sm text-danger-500">Failed to load policy configuration.</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-surface-border bg-surface-900 p-1 text-xs">
        {KIND_TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setKind(t.kind)}
            className={`rounded px-3 py-1.5 font-medium ${
              kind === t.kind ? 'bg-accent-600 text-white' : 'text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <PolicyListSection key={kind} kind={kind} lists={config[LISTS_BY_KIND[kind]]} />
    </div>
  )
}
