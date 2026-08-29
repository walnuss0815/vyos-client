import { useState } from 'react'
import LocalRouteSection from '../../components/policy/LocalRouteSection'
import { usePolicyConfig } from '../../hooks/usePolicyConfig'
import type { LocalRouteFamily } from '../../lib/policyTypes'

const FAMILY_TABS: { family: LocalRouteFamily; label: string }[] = [
  { family: 'ipv4', label: 'IPv4' },
  { family: 'ipv6', label: 'IPv6' },
]

export default function LocalRoutePage() {
  const [family, setFamily] = useState<LocalRouteFamily>('ipv4')
  const { localRoutes, isLoading, isError } = usePolicyConfig()

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
      <LocalRouteSection
        key={family}
        family={family}
        rules={localRoutes.filter((r) => r.family === family)}
      />
    </div>
  )
}
