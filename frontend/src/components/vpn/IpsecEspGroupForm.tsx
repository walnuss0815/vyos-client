import { useState } from 'react'
import {
  addEspProposalOps,
  blankEspGroupFormValues,
  espGroupFormToOps,
  espGroupToFormValues,
  type EspGroupFormValues,
} from '../../lib/vpnIpsecForm'
import {
  IPSEC_ENCRYPTION_CIPHERS,
  IPSEC_ESP_MODES,
  IPSEC_HASH_ALGORITHMS,
  IPSEC_PFS_OPTIONS,
  type IPsecEspGroup,
} from '../../lib/vpnIpsecTypes'
import FieldLabel from '../FieldLabel'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** IpsecEspGroupsSection.tsx's create/edit form, extracted into its
 * own file for size (see IpsecCryptoGroups.tsx's own doc comment for
 * why it's split this way). */
export default function IpsecEspGroupForm({
  group,
  existingNames,
  onDone,
}: {
  group?: IPsecEspGroup
  existingNames: string[]
  onDone: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [values, setValues] = useState<EspGroupFormValues>(group ? espGroupToFormValues(group) : blankEspGroupFormValues())
  const [firstProposalEncryption, setFirstProposalEncryption] = useState('')
  const [firstProposalHash, setFirstProposalHash] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = group === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof EspGroupFormValues>(key: K, value: EspGroupFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = espGroupFormToOps(trimmedName, group, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    // An ESP group with no proposals is meaningless (VyOS has nothing
    // to actually negotiate), and IpsecEspProposals.tsx only ever
    // operates on an already-fetched group - queuing a first proposal
    // here, numbered 10, avoids a detour through commit+refetch just
    // to add one.
    if (isCreate && (firstProposalEncryption || firstProposalHash)) {
      const proposalOps = addEspProposalOps(trimmedName, '10', {
        encryption: firstProposalEncryption,
        hash: firstProposalHash,
        esn: '',
      })
      for (const op of proposalOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New ESP group' : `Edit ${group.name}`}</h3>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Name *
          <input {...noExtensionInputProps} autoFocus disabled={!isCreate} value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} disabled:opacity-60`} />
          {nameTaken && <span className="text-danger-500">This group already exists.</span>}
        </label>
        <FieldLabel
          label="Mode"
          hint="Tunnel wraps entire IP packets in a new header (site-to-site); transport only encrypts the payload, keeping the original IP header (host-to-host)."
        >
          <select value={values.mode} onChange={(e) => update('mode', e.target.value)} className={inputClass}>
            <option value="">Default (tunnel)</option>
            {IPSEC_ESP_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel
          label="PFS"
          hint="Perfect Forward Secrecy: derives a fresh key for each new tunnel from a new Diffie-Hellman exchange, so a compromised key can't decrypt past sessions."
        >
          <select value={values.pfs} onChange={(e) => update('pfs', e.target.value)} className={inputClass}>
            <option value="">Default (enable)</option>
            {IPSEC_PFS_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          Lifetime (s)
          <input {...noExtensionInputProps} value={values.lifetime} onChange={(e) => update('lifetime', e.target.value)} placeholder="3600" className={inputClass} />
        </label>
        <label className={labelClass}>
          Life bytes
          <input {...noExtensionInputProps} value={values.lifeBytes} onChange={(e) => update('lifeBytes', e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Life packets
          <input {...noExtensionInputProps} value={values.lifePackets} onChange={(e) => update('lifePackets', e.target.value)} className={inputClass} />
        </label>
      </div>
      <div className="mt-3 flex gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.compression} onChange={(e) => update('compression', e.target.checked)} className="accent-accent-500" />
          Compression
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.disableRekey} onChange={(e) => update('disableRekey', e.target.checked)} className="accent-accent-500" />
          Disable local re-key
        </label>
      </div>

      {isCreate && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs text-slate-500">First proposal (optional, numbered 10)</p>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Encryption
              <select value={firstProposalEncryption} onChange={(e) => setFirstProposalEncryption(e.target.value)} className={inputClass}>
                <option value="">Default (aes128)</option>
                {IPSEC_ENCRYPTION_CIPHERS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Hash
              <select value={firstProposalHash} onChange={(e) => setFirstProposalHash(e.target.value)} className={inputClass}>
                <option value="">Default (sha1)</option>
                {IPSEC_HASH_ALGORITHMS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">Cancel</button>
      </div>
    </div>
  )
}
