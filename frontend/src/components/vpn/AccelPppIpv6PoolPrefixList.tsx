import { useState } from 'react'
import { addAccelPppClientIpv6PoolPrefixOps, removeAccelPppClientIpv6PoolPrefixOp } from '../../lib/vpnAccelPppForm'
import type { AccelPppKind } from '../../lib/vpnAccelPppTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** AccelPppClientIpv6PoolsSection.tsx's per-pool prefix list,
 * extracted into its own file for size (see AccelPppServer.tsx's own
 * doc comment for why it's split this way). */
export default function AccelPppIpv6PoolPrefixList({
  kind,
  poolName,
  prefixes,
}: {
  kind: AccelPppKind
  poolName: string
  prefixes: { prefix: string; mask?: string }[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [mask, setMask] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedPrefix = prefix.trim()
  const taken = prefixes.some((p) => p.prefix === trimmedPrefix)
  const valid = trimmedPrefix !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addAccelPppClientIpv6PoolPrefixOps(kind, poolName, trimmedPrefix, mask)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setPrefix('')
    setMask('')
    setShowAdd(false)
  }

  return (
    <div className="mt-2 border-t border-surface-border pt-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-slate-500">Prefixes ({prefixes.length})</p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add prefix'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input {...noExtensionInputProps} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="2001:db8::/64" className={inputClass} />
          <input {...noExtensionInputProps} value={mask} onChange={(e) => setMask(e.target.value)} placeholder="client prefix length (default 64)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-2 bg-accent-600 ${buttonClass}`}>Add prefix</button>
          {taken && <p className="col-span-2 text-xs text-danger-500">This prefix is already used.</p>}
        </div>
      )}
      <div className="space-y-1">
        {prefixes.map((p) => (
          <div key={p.prefix} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {p.prefix}
              {p.mask && <span className="text-slate-500"> / mask {p.mask}</span>}
            </span>
            <button
              onClick={() => {
                const op = removeAccelPppClientIpv6PoolPrefixOp(kind, poolName, p.prefix)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {prefixes.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}
