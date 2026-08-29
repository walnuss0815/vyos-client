import { useState } from 'react'
import PrefixListSection from '../../components/policy/PrefixListSection'
import { usePolicyConfig } from '../../hooks/usePolicyConfig'
import type { PrefixListFamily } from '../../lib/policyTypes'

const FAMILY_TABS: { family: PrefixListFamily; label: string }[] = [
  { family: 'ipv4', label: 'IPv4' },
  { family: 'ipv6', label: 'IPv6' },
]

export default function PrefixListsPage() {
  const [family, setFamily] = useState<PrefixListFamily>('ipv4')
  const { prefixLists, isLoading, isError } = usePolicyConfig()

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load policy configuration.</p>

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg border border-surface-border bg-surface-900 p-1 text-xs">
        {FAMILY_TABS.map((t) => (
          <button
            key={t.family}
            onClick={() => setFamily(t.family)}
            className={`rounded px-3 py-1.5 font-medium ${
              family === t.family ? 'bg-accent-600 text-white' : 'text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <PrefixListSection
        key={family}
        family={family}
        lists={prefixLists.filter((l) => l.family === family)}
      />
    </div>
  )
}
