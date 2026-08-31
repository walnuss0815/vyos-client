import { useState } from 'react'
import {
  addIkeProposalOps,
  blankIkeGroupFormValues,
  ikeGroupFormToOps,
  ikeGroupToFormValues,
  type IkeGroupFormValues,
} from '../../lib/vpnIpsecForm'
import {
  IPSEC_CLOSE_ACTIONS,
  IPSEC_DH_GROUPS,
  IPSEC_DPD_ACTIONS,
  IPSEC_ENCRYPTION_CIPHERS,
  IPSEC_HASH_ALGORITHMS,
  IPSEC_IKE_MODES,
  IPSEC_KEY_EXCHANGE_VERSIONS,
  type IPsecIkeGroup,
} from '../../lib/vpnIpsecTypes'
import FieldLabel from '../FieldLabel'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** IpsecIkeGroupsSection.tsx's create/edit form, extracted into its
 * own file for size (see IpsecCryptoGroups.tsx's own doc comment for
 * why it's split this way). */
export default function IpsecIkeGroupForm({
  group,
  existingNames,
  onDone,
}: {
  group?: IPsecIkeGroup
  existingNames: string[]
  onDone: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [values, setValues] = useState<IkeGroupFormValues>(group ? ikeGroupToFormValues(group) : blankIkeGroupFormValues())
  const [firstProposalDhGroup, setFirstProposalDhGroup] = useState('')
  const [firstProposalEncryption, setFirstProposalEncryption] = useState('')
  const [firstProposalHash, setFirstProposalHash] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = group === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof IkeGroupFormValues>(key: K, value: IkeGroupFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = ikeGroupFormToOps(trimmedName, group, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    // An IKE group with no proposals is meaningless (VyOS has nothing
    // to actually negotiate), and IpsecIkeProposals.tsx only ever
    // operates on an already-fetched group - queuing a first proposal
    // here, numbered 10, avoids a detour through commit+refetch just
    // to add one.
    if (isCreate && (firstProposalDhGroup || firstProposalEncryption || firstProposalHash)) {
      const proposalOps = addIkeProposalOps(trimmedName, '10', {
        dhGroup: firstProposalDhGroup,
        prf: '',
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
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New IKE group' : `Edit ${group.name}`}</h3>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Name *
          <input {...noExtensionInputProps} autoFocus disabled={!isCreate} value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} disabled:opacity-60`} />
          {nameTaken && <span className="text-danger-500">This group already exists.</span>}
        </label>
        <FieldLabel
          label="Key exchange version"
          hint="IKEv2 is the modern, simpler protocol (recommended for new tunnels); IKEv1 is the older version, still needed for compatibility with some legacy peers."
        >
          <select value={values.keyExchange} onChange={(e) => update('keyExchange', e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {IPSEC_KEY_EXCHANGE_VERSIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="IKEv1 phase-1 mode" hint="Aggressive mode negotiates faster but exposes the peer identity before encryption is established - main mode is more private. IKEv2 ignores this setting.">
          <select value={values.mode} onChange={(e) => update('mode', e.target.value)} className={inputClass}>
            <option value="">Default (main)</option>
            {IPSEC_IKE_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          Lifetime (s)
          <input {...noExtensionInputProps} value={values.lifetime} onChange={(e) => update('lifetime', e.target.value)} placeholder="28800" className={inputClass} />
        </label>
        <FieldLabel label="Close action" hint="What to do when this IKE session's peer becomes unreachable - e.g. re-negotiate a new tunnel automatically ('restart').">
          <select value={values.closeAction} onChange={(e) => update('closeAction', e.target.value)} className={inputClass}>
            <option value="">Default (none)</option>
            {IPSEC_CLOSE_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="DPD action" hint="Dead Peer Detection: what to do once the peer stops responding to keepalive probes - e.g. tear the tunnel down ('clear') or try to restart it.">
          <select value={values.dpdAction} onChange={(e) => update('dpdAction', e.target.value)} className={inputClass}>
            <option value="">Default (clear)</option>
            {IPSEC_DPD_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          DPD interval (s)
          <input {...noExtensionInputProps} value={values.dpdInterval} onChange={(e) => update('dpdInterval', e.target.value)} placeholder="30" className={inputClass} />
        </label>
        <label className={labelClass}>
          DPD timeout (s, IKEv1 only)
          <input {...noExtensionInputProps} value={values.dpdTimeout} onChange={(e) => update('dpdTimeout', e.target.value)} placeholder="120" className={inputClass} />
        </label>
      </div>
      <div className="mt-3 flex gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.ikev2Reauth} onChange={(e) => update('ikev2Reauth', e.target.checked)} className="accent-accent-500" />
          Re-authenticate on re-key (IKEv2)
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.disableMobike} onChange={(e) => update('disableMobike', e.target.checked)} className="accent-accent-500" />
          Disable MOBIKE (IKEv2)
        </label>
      </div>

      {isCreate && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs text-slate-500">First proposal (optional, numbered 10)</p>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              DH group
              <select value={firstProposalDhGroup} onChange={(e) => setFirstProposalDhGroup(e.target.value)} className={inputClass}>
                <option value="">Select…</option>
                {IPSEC_DH_GROUPS.map((g) => (
                  <option key={g} value={g}>dh-group{g}</option>
                ))}
              </select>
            </label>
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
