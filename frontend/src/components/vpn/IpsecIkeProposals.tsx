import { useState } from 'react'
import { addIkeProposalOps, removeIkeProposalOp } from '../../lib/vpnIpsecForm'
import { IPSEC_DH_GROUPS, IPSEC_ENCRYPTION_CIPHERS, IPSEC_HASH_ALGORITHMS, IPSEC_PRF_ALGORITHMS, type IPsecIkeGroup } from '../../lib/vpnIpsecTypes'
import InfoTooltip from '../InfoTooltip'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** IpsecIkeGroupsSection.tsx's per-group proposal list, extracted into
 * its own file for size (see IpsecCryptoGroups.tsx's own doc comment
 * for why it's split this way). */
export default function IpsecIkeProposals({ group }: { group: IPsecIkeGroup }) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [dhGroup, setDhGroup] = useState('')
  const [prf, setPrf] = useState('')
  const [encryption, setEncryption] = useState('')
  const [hash, setHash] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = group.proposals.some((p) => p.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addIkeProposalOps(group.name, trimmedId, { dhGroup, prf, encryption, hash, esn: '' })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setId('')
    setDhGroup('')
    setPrf('')
    setEncryption('')
    setHash('')
    setShowAdd(false)
  }

  return (
    <div className="mt-3 border-t border-surface-border pt-3">
      <p className="mb-1 text-xs text-slate-500">Proposals</p>
      {group.proposals.map((p) => (
        <div key={p.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {p.id}: {p.encryption ?? 'aes128'} / {p.hash ?? 'sha1'}
            {p.dhGroup && ` / dh${p.dhGroup}`}
            {p.prf && ` / ${p.prf}`}
          </span>
          <button
            onClick={() => {
              const op = removeIkeProposalOp(group.name, p.id)
              add({ op, label: `delete ${op.path.join(' ')}` })
            }}
            className="text-xs text-slate-500 hover:text-danger-500"
          >
            Remove
          </button>
        </div>
      ))}
      {group.proposals.length === 0 && <p className="text-xs text-slate-500">No proposals configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add proposal'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input {...noExtensionInputProps} value={id} onChange={(e) => setId(e.target.value)} placeholder="priority #" className={inputClass} />
          <div className="flex items-center gap-1">
            <select value={dhGroup} onChange={(e) => setDhGroup(e.target.value)} className={`flex-1 ${inputClass}`}>
              <option value="">DH group…</option>
              {IPSEC_DH_GROUPS.map((g) => (
                <option key={g} value={g}>dh-group{g}</option>
              ))}
            </select>
            <InfoTooltip text="Diffie-Hellman group: the key-exchange strength. Higher-numbered groups are stronger but slower to negotiate - group 14 is a common modern baseline." />
          </div>
          <div className="flex items-center gap-1">
            <select value={prf} onChange={(e) => setPrf(e.target.value)} className={`flex-1 ${inputClass}`}>
              <option value="">PRF…</option>
              {IPSEC_PRF_ALGORITHMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <InfoTooltip text="Pseudo-Random Function: derives session keys from the DH exchange. Left blank, VyOS reuses the proposal's hash algorithm." />
          </div>
          <select value={encryption} onChange={(e) => setEncryption(e.target.value)} className={inputClass}>
            <option value="">Default (aes128)</option>
            {IPSEC_ENCRYPTION_CIPHERS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={hash} onChange={(e) => setHash(e.target.value)} className={inputClass}>
            <option value="">Default (sha1)</option>
            {IPSEC_HASH_ALGORITHMS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <button onClick={submit} disabled={!valid} className={`col-span-5 bg-accent-600 ${buttonClass}`}>Add proposal</button>
          {taken && <p className="col-span-5 text-xs text-danger-500">This proposal number is already used.</p>}
        </div>
      )}
    </div>
  )
}
