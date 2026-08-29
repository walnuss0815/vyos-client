import { useState } from 'react'
import { useQosShaperStatus } from '../../hooks/useQosStatus'
import { inputClass } from '../../lib/formStyles'
import InfoTooltip from '../InfoTooltip'

/** Live per-class stats from `show qos shaper interface <ifname>` -
 * manually refreshed, matching this app's other "basic status"
 * panels. Only interfaces with a `shaper`-type egress policy have any
 * data through this command at all - VyOS has no equivalent stats
 * view for the other 7 policy types this app manages (see the
 * backend's ParseQosShaperStatus doc comment). */
export default function QosShaperStatusPanel({ interfaceNames }: { interfaceNames: string[] }) {
  const [selected, setSelected] = useState<string>(interfaceNames[0] ?? '')
  const query = useQosShaperStatus(selected || undefined)

  return (
    <div className="mb-8 rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Live status
          <InfoTooltip text="Only shows data for interfaces whose egress policy is specifically type 'shaper' - VyOS has no equivalent stats command for the other policy types this app manages." />
        </p>
        <div className="flex items-center gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className={inputClass}>
            <option value="">select an interface…</option>
            {interfaceNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void query.refetch()}
            disabled={!selected || query.isFetching}
            className="text-xs text-accent-500 hover:text-accent-400 disabled:opacity-50"
          >
            {query.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {!selected && <p className="text-xs text-slate-500">Select an interface to view its shaper stats.</p>}
      {selected && query.isLoading && <p className="text-xs text-slate-400">Loading…</p>}
      {selected && query.isError && (
        <p className="text-xs text-danger-500">
          Failed to load QoS status for {selected} - it may not have a shaper-type policy applied.
        </p>
      )}
      {query.data && (
        <>
          <p className="mb-2 text-xs text-slate-400">Policy: {query.data.policyName}</p>
          {query.data.classes.length === 0 ? (
            <p className="text-xs text-slate-500">No class data returned.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 pr-3">Class</th>
                    <th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Bandwidth</th>
                    <th className="py-1 pr-3">Max BW</th>
                    <th className="py-1 pr-3">Bytes</th>
                    <th className="py-1 pr-3">Packets</th>
                    <th className="py-1 pr-3">Drops</th>
                    <th className="py-1 pr-3">Queued</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.classes.map((c, i) => (
                    <tr key={`${c.class}-${i}`} className="border-t border-surface-border text-slate-300">
                      <td className="py-1 pr-3 font-mono">{c.class}</td>
                      <td className="py-1 pr-3 font-mono">{c.type}</td>
                      <td className="py-1 pr-3">{c.bandwidth}</td>
                      <td className="py-1 pr-3">{c.maxBw}</td>
                      <td className="py-1 pr-3">{c.bytes}</td>
                      <td className="py-1 pr-3">{c.packets}</td>
                      <td className="py-1 pr-3">{c.drops}</td>
                      <td className="py-1 pr-3">{c.queued}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
