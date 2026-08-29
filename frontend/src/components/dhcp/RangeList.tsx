import { useState } from 'react'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { rangePath } from '../../lib/dhcpConfigParse'
import type { DHCPRange } from '../../lib/dhcpConfigTypes'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** The next unused numeric range ID, as a string - "0", "1", 2", ...
 * Ranges with a non-numeric (named) ID are ignored for this purpose;
 * new ranges created through this UI are always numbered, even if an
 * existing one (created via Config Tree) happens to be named. */
function suggestNextRangeId(existing: DHCPRange[]): string {
  const numericIds = existing.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n >= 0)
  const next = numericIds.length === 0 ? 0 : Math.max(...numericIds) + 1
  return String(next)
}

/** A subnet's dynamic address range(s) - the pool DHCP leases are
 * actually drawn from (see lib/dhcpPoolUtilization.ts, which sizes the
 * pool-utilization bar from these). */
export default function RangeList({
  networkName,
  cidr,
  ranges,
}: {
  networkName: string
  cidr: string
  ranges: DHCPRange[]
}) {
  const [start, setStart] = useState('')
  const [stop, setStop] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  function queueAdd() {
    if (!start.trim() || !stop.trim()) return
    const id = suggestNextRangeId(ranges)
    const base = rangePath(networkName, cidr, id)
    add({ op: { op: 'set', path: [...base, 'start'], value: start.trim() }, label: `set ... range ${id} start '${start.trim()}'` })
    add({ op: { op: 'set', path: [...base, 'stop'], value: stop.trim() }, label: `set ... range ${id} stop '${stop.trim()}'` })
    setStart('')
    setStop('')
  }

  function queueRemove(id: string) {
    add({ op: { op: 'delete', path: rangePath(networkName, cidr, id) }, label: `delete ... range ${id}` })
  }

  return (
    <div>
      <div className="space-y-1">
        {ranges.map((range) => (
          <div
            key={range.id}
            className="flex items-center justify-between gap-2 rounded bg-surface-800 px-2 py-1 text-xs"
          >
            <span className="font-mono text-slate-300">
              {range.start ?? '?'} – {range.stop ?? '?'}
            </span>
            <button
              onClick={() => queueRemove(range.id)}
              className="text-slate-500 hover:text-danger-500"
              aria-label={`Remove range ${range.id}`}
            >
              ✕
            </button>
          </div>
        ))}
        {ranges.length === 0 && <p className="text-xs text-slate-500">No ranges configured.</p>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          {...noExtensionInputProps}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="Start (192.168.1.50)"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={stop}
          onChange={(e) => setStop(e.target.value)}
          placeholder="Stop (192.168.1.250)"
          className={inputClass}
        />
        <button
          onClick={queueAdd}
          disabled={!start.trim() || !stop.trim()}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Add range
        </button>
      </div>
    </div>
  )
}
