import { globalOptionsPath } from '../../lib/firewallParse'
import { useFirewallConfig } from '../../hooks/useFirewallConfig'
import { usePendingChangesStore } from '../../store/pendingChanges'
import { inputClass as selectClass } from '../../lib/formStyles'
import InfoTooltip from '../../components/InfoTooltip'

export default function GlobalOptionsPage() {
  const { globalOptions, isLoading, isError } = useFirewallConfig()
  const add = usePendingChangesStore((s) => s.add)

  function queueToggle(...segments: string[]) {
    return (value: string) => {
      add({
        op: { op: 'set', path: globalOptionsPath(...segments), value },
        label: `set firewall global-options ${segments.join(' ')} '${value}'`,
      })
    }
  }

  if (isLoading) return <p className="text-sm text-slate-400">Loading…</p>
  if (isError) return <p className="text-sm text-danger-500">Failed to load firewall configuration.</p>

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">ICMP &amp; hardening</h3>
        <div className="space-y-2 rounded-xl border border-surface-border bg-surface-900 p-4">
          <ToggleRow
            label="Respond to all ping to the router"
            hint="Whether the router answers ICMP echo requests (ping) sent to any of its own addresses."
            value={globalOptions.allPing}
            onChange={queueToggle('all-ping')}
          />
          <ToggleRow
            label="Respond to broadcast ping"
            hint="Whether to answer pings sent to a broadcast address (e.g. 192.168.1.255) - leaving this off avoids participating in Smurf-style amplification floods."
            value={globalOptions.broadcastPing}
            onChange={queueToggle('broadcast-ping')}
          />
          <ToggleRow
            label="TCP SYN cookies"
            hint="A defense against SYN-flood attacks: instead of allocating state for every half-open connection, the kernel encodes it into the SYN-ACK sequence number and reconstructs it only if the handshake completes."
            value={globalOptions.synCookies}
            onChange={queueToggle('syn-cookies')}
          />
          <ToggleRow
            label="Log martian (spoofed/unroutable) packets"
            hint="A 'martian packet' has a source or destination address that shouldn't be able to reach this interface (e.g. spoofed) - logging them helps spot spoofing or routing misconfiguration."
            value={globalOptions.logMartians}
            onChange={queueToggle('log-martians')}
          />
          <ToggleRow
            label="Accept IP source-routed packets"
            hint="Source routing lets the sender dictate a packet's path through the network - a legacy feature almost never needed today and commonly abused to bypass filtering, so this is usually left off."
            value={globalOptions.ipSrcRoute}
            onChange={queueToggle('ip-src-route')}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Connection state policy
        </h3>
        <p className="mb-2 text-xs text-slate-500">
          Applies globally, before any per-rule filtering; typically left as accept for established
          and related, and drop for invalid.
        </p>
        <div className="space-y-2 rounded-xl border border-surface-border bg-surface-900 p-4">
          <ActionRow
            label="Established connections"
            hint="Traffic belonging to a connection the connection tracker has already seen a reply for."
            value={globalOptions.stateEstablishedAction}
            onChange={queueToggle('state-policy', 'established', 'action')}
          />
          <ActionRow
            label="Related connections"
            hint="Traffic that's tied to an existing connection but isn't part of it directly - e.g. an FTP data channel, or an ICMP error referencing another flow."
            value={globalOptions.stateRelatedAction}
            onChange={queueToggle('state-policy', 'related', 'action')}
          />
          <ActionRow
            label="Invalid connections"
            hint="Packets the connection tracker can't associate with any known connection state - often malformed or spoofed traffic."
            value={globalOptions.stateInvalidAction}
            onChange={queueToggle('state-policy', 'invalid', 'action')}
          />
        </div>
      </section>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: 'enable' | 'disable' | undefined
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="inline-flex items-center gap-1 text-slate-300">
        {label}
        {hint && <InfoTooltip text={hint} />}
      </span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="" disabled>
          not set
        </option>
        <option value="enable">enable</option>
        <option value="disable">disable</option>
      </select>
    </label>
  )
}

function ActionRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: string | undefined
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="inline-flex items-center gap-1 text-slate-300">
        {label}
        {hint && <InfoTooltip text={hint} />}
      </span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="" disabled>
          not set
        </option>
        <option value="accept">accept</option>
        <option value="drop">drop</option>
        <option value="reject">reject</option>
      </select>
    </label>
  )
}
