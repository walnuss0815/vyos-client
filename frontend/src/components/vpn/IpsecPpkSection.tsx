import { useState } from 'react'
import { addPpkOps, removePpkOp } from '../../lib/vpnIpsecForm'
import { IPSEC_SECRET_TYPES, type IPsecConfig } from '../../lib/vpnIpsecTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** IpsecCryptoGroups.tsx's "Post-quantum pre-shared keys" section -
 * one of that component's several sections, extracted into its own
 * file for size (see IpsecCryptoGroups.tsx's own doc comment for why
 * it's split this way). */
export default function IpsecPpkSection({ config }: { config: IPsecConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [ids, setIds] = useState('')
  const [secret, setSecret] = useState('')
  const [secretType, setSecretType] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = config.ppks.some((p) => p.name === trimmedName)
  const valid = trimmedName !== '' && !taken

  function submit() {
    if (!valid) return
    const idList = ids.split(',').map((s) => s.trim()).filter(Boolean)
    const ops = addPpkOps(trimmedName, { ids: idList, secret, secretType })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setName('')
    setIds('')
    setSecret('')
    setSecretType('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Post-quantum pre-shared keys ({config.ppks.length})
        </h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add PPK'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-3 space-y-2 rounded-xl border border-surface-border bg-surface-900 p-4">
          <div className="grid grid-cols-2 gap-2">
            <input {...noExtensionInputProps} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="label" className={inputClass} />
            <select value={secretType} onChange={(e) => setSecretType(e.target.value)} className={inputClass}>
              <option value="">Default (plaintext)</option>
              {IPSEC_SECRET_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <input {...noExtensionInputProps} value={ids} onChange={(e) => setIds(e.target.value)} placeholder="IDs, comma-separated" className={`w-full ${inputClass}`} />
          <input {...noExtensionInputProps} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="secret" className={`w-full ${inputClass}`} />
          {taken && <p className="text-xs text-danger-500">This label is already used.</p>}
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>Add PPK</button>
        </div>
      )}
      <div className="space-y-1">
        {config.ppks.map((ppk) => (
          <div key={ppk.name} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {ppk.name}: {ppk.ids.join(', ')}
              {ppk.hasSecret && <span className="text-slate-500"> · secret set</span>}
            </span>
            <button
              onClick={() => {
                const op = removePpkOp(ppk.name)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {config.ppks.length === 0 && <p className="text-xs text-slate-500">No PPKs configured yet.</p>}
      </div>
    </div>
  )
}
