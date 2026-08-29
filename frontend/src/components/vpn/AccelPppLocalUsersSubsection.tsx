import { useState } from 'react'
import { addAccelPppLocalUserOps, removeAccelPppLocalUserOp, toggleAccelPppLocalUserDisabledOp } from '../../lib/vpnAccelPppForm'
import type { AccelPppConfig, AccelPppKind } from '../../lib/vpnAccelPppTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** AccelPppAuthenticationSection.tsx's "Local users" subsection,
 * extracted into its own file for size (see AccelPppServer.tsx's own
 * doc comment for why it's split this way). */
export default function AccelPppLocalUsersSubsection({ kind, config }: { kind: AccelPppKind; config: AccelPppConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [staticIp, setStaticIp] = useState('')
  const [rateLimitUpload, setRateLimitUpload] = useState('')
  const [rateLimitDownload, setRateLimitDownload] = useState('')
  const add = usePendingChangesStore((s) => s.add)
  const { localUsers } = config.authentication

  const trimmed = username.trim()
  const taken = localUsers.some((u) => u.username === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addAccelPppLocalUserOps(kind, trimmed, { password, staticIp, rateLimitUpload, rateLimitDownload })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setUsername('')
    setPassword('')
    setStaticIp('')
    setRateLimitUpload('')
    setRateLimitDownload('')
    setShowAdd(false)
  }

  return (
    <div className="mt-4 border-t border-surface-border pt-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-slate-500">Local users ({localUsers.length})</p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add user'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input {...noExtensionInputProps} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className={inputClass} />
          <input {...noExtensionInputProps} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" className={inputClass} />
          <input {...noExtensionInputProps} value={staticIp} onChange={(e) => setStaticIp(e.target.value)} placeholder="static IP (optional)" className={inputClass} />
          <input {...noExtensionInputProps} value={rateLimitUpload} onChange={(e) => setRateLimitUpload(e.target.value)} placeholder="upload kbit/s" className={inputClass} />
          <input {...noExtensionInputProps} value={rateLimitDownload} onChange={(e) => setRateLimitDownload(e.target.value)} placeholder="download kbit/s" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-5 bg-accent-600 ${buttonClass}`}>Add</button>
          {taken && <p className="col-span-5 text-xs text-danger-500">This username is already used.</p>}
        </div>
      )}
      <div className="space-y-1">
        {localUsers.map((user) => (
          <div key={user.username} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {user.username}
              {user.disabled && <span className="ml-1 text-danger-500">(disabled)</span>}
              {user.hasPassword && <span className="text-slate-500"> · password set</span>}
              {user.staticIp && <span className="text-slate-500"> · {user.staticIp}</span>}
            </span>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => {
                  const op = toggleAccelPppLocalUserDisabledOp(kind, user.username, !user.disabled)
                  add({ op, label: `${op.op} ${op.path.join(' ')}` })
                }}
                className="text-slate-500 hover:text-accent-400"
              >
                {user.disabled ? 'Enable' : 'Disable'}
              </button>
              <button
                onClick={() => {
                  const op = removeAccelPppLocalUserOp(kind, user.username)
                  add({ op, label: `delete ${op.path.join(' ')}` })
                }}
                className="text-slate-500 hover:text-danger-500"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {localUsers.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}
