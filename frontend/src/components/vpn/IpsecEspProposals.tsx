import { useState } from 'react'
import { addEspProposalOps, removeEspProposalOp } from '../../lib/vpnIpsecForm'
import { IPSEC_ENCRYPTION_CIPHERS, IPSEC_ESN_OPTIONS, IPSEC_HASH_ALGORITHMS, type IPsecEspGroup } from '../../lib/vpnIpsecTypes'
import InfoTooltip from '../InfoTooltip'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** IpsecEspGroupsSection.tsx's per-group proposal list, extracted into
 * its own file for size (see IpsecCryptoGroups.tsx's own doc comment
 * for why it's split this way). */
export default function IpsecEspProposals({ group }: { group: IPsecEspGroup }) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [encryption, setEncryption] = useState('')
  const [hash, setHash] = useState('')
  const [esn, setEsn] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = group.proposals.some((p) => p.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addEspProposalOps(group.name, trimmedId, { encryption, hash, esn })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setId('')
    setEncryption('')
    setHash('')
    setEsn('')
    setShowAdd(false)
  }

  return (
    <div className="mt-3 border-t border-surface-border pt-3">
      <p className="mb-1 text-xs text-slate-500">Proposals</p>
      {group.proposals.map((p) => (
        <div key={p.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {p.id}: {p.encryption ?? 'aes128'} / {p.hash ?? 'sha1'} {p.esn && p.esn !== 'disabled' ? `/ esn=${p.esn}` : ''}
          </span>
          <button
            onClick={() => {
              const op = removeEspProposalOp(group.name, p.id)
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
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input {...noExtensionInputProps} value={id} onChange={(e) => setId(e.target.value)} placeholder="priority #" className={inputClass} />
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
          <div className="flex items-center gap-1">
            <select value={esn} onChange={(e) => setEsn(e.target.value)} className={`flex-1 ${inputClass}`}>
              <option value="">Default (disabled)</option>
              {IPSEC_ESN_OPTIONS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <InfoTooltip text="Extended Sequence Number: a wider anti-replay packet counter, useful on very-high-throughput tunnels where the standard 32-bit counter could wrap." />
          </div>
          <button onClick={submit} disabled={!valid} className={`col-span-4 bg-accent-600 ${buttonClass}`}>Add proposal</button>
          {taken && <p className="col-span-4 text-xs text-danger-500">This proposal number is already used.</p>}
        </div>
      )}
    </div>
  )
}
