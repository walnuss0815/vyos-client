import { disableAccelPppOp, enableAccelPppOp } from '../../lib/vpnAccelPppForm'
import type { AccelPppConfig, AccelPppKind } from '../../lib/vpnAccelPppTypes'
import { buttonClass } from '../../lib/formStyles'
import { usePendingChangesStore } from '../../store/pendingChanges'
import AccelPppAuthenticationSection from './AccelPppAuthenticationSection'
import AccelPppClientIpPoolsSection from './AccelPppClientIpPoolsSection'
import AccelPppClientIpv6PoolsSection from './AccelPppClientIpv6PoolsSection'
import AccelPppSettingsSection from './AccelPppSettingsSection'

const KIND_LABELS: Record<AccelPppKind, string> = { l2tp: 'L2TP', pptp: 'PPTP', sstp: 'SSTP' }

// This component's sections (Settings, Authentication - with its own
// local-users/RADIUS-servers subsections -, Client IPv4 pools, Client
// IPv6 pools - with its own per-pool prefix list) are each split into
// their own file (AccelPpp*.tsx, same directory) rather than kept as
// nested functions in one large file - purely a maintainability split
// (each section is independently readable/testable-in-principle),
// no behavior change from the single-file version this used to be.
export default function AccelPppServer({ kind, config }: { kind: AccelPppKind; config: AccelPppConfig }) {
  const add = usePendingChangesStore((s) => s.add)
  const label = KIND_LABELS[kind]

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">{label} is not configured.</p>
        <button
          onClick={() => {
            const op = enableAccelPppOp(kind)
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable {label}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <AccelPppSettingsSection kind={kind} config={config} />
      <AccelPppAuthenticationSection kind={kind} config={config} />
      <AccelPppClientIpPoolsSection kind={kind} config={config} />
      <AccelPppClientIpv6PoolsSection kind={kind} config={config} />
      <div>
        <button
          onClick={() => {
            const op = disableAccelPppOp(kind)
            add({ op, label: `delete ${op.path.join(' ')}` })
          }}
          className="text-xs text-danger-500 hover:text-danger-400"
        >
          Disable {label} entirely
        </button>
      </div>
    </div>
  )
}
