import { useState } from 'react'
import { accelPppClientIpv6PoolPath } from '../../lib/vpnAccelPppParse'
import { removeAccelPppClientIpv6PoolOp } from '../../lib/vpnAccelPppForm'
import type { AccelPppConfig, AccelPppKind } from '../../lib/vpnAccelPppTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import AccelPppIpv6PoolPrefixList from './AccelPppIpv6PoolPrefixList'

/** AccelPppServer.tsx's "Client IPv6 pools" section - one of that
 * component's several sections, extracted into its own file for size
 * (see AccelPppServer.tsx's own doc comment for why it's split this
 * way). Includes its own per-pool prefix list, further extracted into
 * its own file. */
export default function AccelPppClientIpv6PoolsSection({ kind, config }: { kind: AccelPppKind; config: AccelPppConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const add = usePendingChangesStore((s) => s.add)
  const { clientIpv6Pools } = config

  const trimmedName = name.trim()
  const taken = clientIpv6Pools.some((p) => p.name === trimmedName)
  const valid = trimmedName !== '' && !taken

  function submit() {
    if (!valid) return
    const op = { op: 'set' as const, path: accelPppClientIpv6PoolPath(kind, trimmedName) }
    add({ op, label: `set ${op.path.join(' ')}` })
    setName('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Client IPv6 pools ({clientIpv6Pools.length})</h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ New pool'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-surface-border bg-surface-900 p-4">
          <input {...noExtensionInputProps} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="pool name" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>Create</button>
          {taken && <p className="text-xs text-danger-500">This pool already exists.</p>}
        </div>
      )}
      <div className="space-y-2">
        {clientIpv6Pools.map((pool) => (
          <div key={pool.name} className="rounded-xl border border-surface-border bg-surface-900 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-300">{pool.name}</span>
              <button
                onClick={() => {
                  const op = removeAccelPppClientIpv6PoolOp(kind, pool.name)
                  add({ op, label: `delete ${op.path.join(' ')}` })
                }}
                className="text-xs text-slate-500 hover:text-danger-500"
              >
                Remove pool
              </button>
            </div>
            <AccelPppIpv6PoolPrefixList kind={kind} poolName={pool.name} prefixes={pool.prefixes} />
          </div>
        ))}
        {clientIpv6Pools.length === 0 && <p className="text-xs text-slate-500">No pools configured yet.</p>}
      </div>
    </div>
  )
}
