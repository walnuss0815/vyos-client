import { useState } from 'react'
import { addAccelPppRadiusServerOps, removeAccelPppRadiusServerOp } from '../../lib/vpnAccelPppForm'
import type { AccelPppConfig, AccelPppKind } from '../../lib/vpnAccelPppTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** AccelPppAuthenticationSection.tsx's "RADIUS servers" subsection,
 * extracted into its own file for size (see AccelPppServer.tsx's own
 * doc comment for why it's split this way). */
export default function AccelPppRadiusServersSubsection({ kind, config }: { kind: AccelPppKind; config: AccelPppConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [key, setKey] = useState('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)
  const { servers } = config.authentication.radius

  const trimmedAddress = address.trim()
  const taken = servers.some((s) => s.address === trimmedAddress)
  const valid = trimmedAddress !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addAccelPppRadiusServerOps(kind, trimmedAddress, key, port)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setKey('')
    setPort('')
    setShowAdd(false)
  }

  return (
    <div className="mt-4 border-t border-surface-border pt-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-slate-500">RADIUS servers ({servers.length})</p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add server'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.0.2.9" className={inputClass} />
          <input {...noExtensionInputProps} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="shared secret" className={inputClass} />
          <input {...noExtensionInputProps} value={port} onChange={(e) => setPort(e.target.value)} placeholder="port (default 1812)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>Add server</button>
          {taken && <p className="col-span-3 text-xs text-danger-500">Already configured.</p>}
        </div>
      )}
      <div className="space-y-1">
        {servers.map((server) => (
          <div key={server.address} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {server.address}
              {server.port && `:${server.port}`}
              {server.hasKey && <span className="text-slate-500"> · key set</span>}
            </span>
            <button
              onClick={() => {
                const op = removeAccelPppRadiusServerOp(kind, server.address)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {servers.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}
