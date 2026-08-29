import { useState } from 'react'
import InfoTooltip from '../InfoTooltip'
import {
  setWANHookOp,
  toggleDisableSourceNatOp,
  toggleEnableLocalTrafficOp,
  toggleFlushConnectionsOp,
  toggleOnlyDefaultRouteOp,
  toggleStickyInboundOp,
} from '../../lib/loadBalancingWanForm'
import type { WANConfig } from '../../lib/loadBalancingTypes'
import type { ConfigOp } from '../../lib/vyosApi'
import { inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** Global WAN load-balancing toggles - each queued immediately on
 * click/blur, matching RulesetDetailPage.tsx's queueSetDefaultAction
 * convention (a standalone setting, not part of a bigger save action)
 * rather than the "form + Save" pattern used for rules/interface
 * health below. */
export default function WanGlobalSettings({ wan }: { wan: WANConfig }) {
  const add = usePendingChangesStore((s) => s.add)
  const [hook, setHook] = useState(wan.hook ?? '')

  function toggle(op: ConfigOp, label: string) {
    add({ op, label })
  }

  return (
    <div className="mb-6 rounded-xl border border-surface-border bg-surface-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Global settings</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={wan.disableSourceNat}
            onChange={(e) => toggle(toggleDisableSourceNatOp(e.target.checked), `${e.target.checked ? 'set' : 'delete'} load-balancing wan disable-source-nat`)}
            className="accent-accent-500"
          />
          Disable source NAT
          <InfoTooltip text="By default this feature auto-generates SNAT rules so return traffic comes back through the same interface it left on. Turning this off skips that - only do so if you already have your own NAT rules covering the same traffic." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={wan.enableLocalTraffic}
            onChange={(e) => toggle(toggleEnableLocalTrafficOp(e.target.checked), `${e.target.checked ? 'set' : 'delete'} load-balancing wan enable-local-traffic`)}
            className="accent-accent-500"
          />
          Load-balance locally-originated traffic
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={wan.flushConnections}
            onChange={(e) => toggle(toggleFlushConnectionsOp(e.target.checked), `${e.target.checked ? 'set' : 'delete'} load-balancing wan flush-connections`)}
            className="accent-accent-500"
          />
          Flush connections on interface state change
          <InfoTooltip text="Without this, an existing session stays pinned to whichever interface it started on even after that interface fails - flushing conntrack forces affected sessions to re-establish through a healthy interface instead." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={wan.onlyDefaultRoute}
            onChange={(e) => toggle(toggleOnlyDefaultRouteOp(e.target.checked), `${e.target.checked ? 'set' : 'delete'} load-balancing wan only-default-route`)}
            className="accent-accent-500"
          />
          Prefer main routing table's specific routes
          <InfoTooltip text="When on, a destination already covered by a specific (non-default) route in the main routing table bypasses WAN load-balancing entirely - only traffic that would otherwise hit the default route gets load-balanced. A recent VyOS addition; confirm your router's version supports it before relying on it." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={wan.stickyInbound}
            onChange={(e) => toggle(toggleStickyInboundOp(e.target.checked), `${e.target.checked ? 'set' : 'delete'} load-balancing wan sticky-connections inbound`)}
            className="accent-accent-500"
          />
          Sticky inbound connections
          <InfoTooltip text="Keeps an inbound WAN session pinned to whichever interface it first arrived on for its whole lifetime, instead of potentially being load-balanced across interfaces mid-session." />
        </label>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-xs text-slate-400">
        Hook script (optional)
        <span className="flex gap-2">
          <input
            {...noExtensionInputProps}
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            onBlur={() => {
              if (hook !== (wan.hook ?? '')) {
                add({ op: setWANHookOp(hook), label: `set load-balancing wan hook '${hook}'` })
              }
            }}
            placeholder="/config/scripts/wlb-hook.sh"
            className={`flex-1 font-mono ${inputClass}`}
          />
        </span>
      </label>
    </div>
  )
}
