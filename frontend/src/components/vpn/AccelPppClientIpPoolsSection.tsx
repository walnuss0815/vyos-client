import { useState } from 'react'
import { addAccelPppClientIpPoolOps, removeAccelPppClientIpPoolOp } from '../../lib/vpnAccelPppForm'
import type { AccelPppConfig, AccelPppKind } from '../../lib/vpnAccelPppTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** AccelPppServer.tsx's "Client IPv4 pools" section - one of that
 * component's several sections, extracted into its own file for size
 * (see AccelPppServer.tsx's own doc comment for why it's split this
 * way). */
export default function AccelPppClientIpPoolsSection({ kind, config }: { kind: AccelPppKind; config: AccelPppConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [rangesText, setRangesText] = useState('')
  const [nextPool, setNextPool] = useState('')
  const add = usePendingChangesStore((s) => s.add)
  const { clientIpPools } = config

  const trimmedName = name.trim()
  const taken = clientIpPools.some((p) => p.name === trimmedName)
  const ranges = rangesText.split(',').map((r) => r.trim()).filter(Boolean)
  const valid = trimmedName !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addAccelPppClientIpPoolOps(kind, trimmedName, { ranges, nextPool })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setName('')
    setRangesText('')
    setNextPool('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Client IPv4 pools ({clientIpPools.length})</h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add pool'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border border-surface-border bg-surface-900 p-4">
          <input {...noExtensionInputProps} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="pool name" className={inputClass} />
          <input {...noExtensionInputProps} value={rangesText} onChange={(e) => setRangesText(e.target.value)} placeholder="192.0.2.0/24, 198.51.100.0/24" className={inputClass} />
          <input {...noExtensionInputProps} value={nextPool} onChange={(e) => setNextPool(e.target.value)} placeholder="next pool (optional)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>Add pool</button>
          {taken && <p className="col-span-3 text-xs text-danger-500">This pool already exists.</p>}
        </div>
      )}
      <div className="space-y-2">
        {clientIpPools.map((pool) => (
          <div key={pool.name} className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-900 p-3">
            <span className="font-mono text-xs text-slate-300">
              {pool.name}: {pool.ranges.join(', ') || '(no ranges)'}
              {pool.nextPool && <span className="text-slate-500"> → {pool.nextPool}</span>}
            </span>
            <button
              onClick={() => {
                const op = removeAccelPppClientIpPoolOp(kind, pool.name)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {clientIpPools.length === 0 && <p className="text-xs text-slate-500">No pools configured yet.</p>}
      </div>
    </div>
  )
}
