import { useState } from 'react'
import { blankCAFormValues, caFormToOps, caToFormValues, type PKICAFormValues } from '../../lib/pkiCAForm'
import { pkiCAPath } from '../../lib/pkiParse'
import type { PKICertificateAuthority } from '../../lib/pkiTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

const textareaClass =
  'w-full rounded border border-surface-border bg-surface-800 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-accent-500'

interface CAFormProps {
  /** undefined = creating a new CA. */
  ca?: PKICertificateAuthority
  existingNames: string[]
  onDone: () => void
}

export default function CAForm({ ca, existingNames, onDone }: CAFormProps) {
  const [name, setName] = useState(ca?.name ?? '')
  const [values, setValues] = useState<PKICAFormValues>(ca ? caToFormValues(ca) : blankCAFormValues())
  const [firstCrl, setFirstCrl] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = ca === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof PKICAFormValues>(key: K, value: PKICAFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = caFormToOps(trimmedName, ca, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    // A CA's CRLs used to only be addable AFTER the CA already
    // existed - CAList.tsx's ChipList only ever operates on an
    // already-fetched CA. Queuing a first one here, in the same
    // commit as the CA itself, avoids a detour through
    // commit+refetch.
    if (isCreate && firstCrl.trim()) {
      add({
        op: { op: 'set', path: [...pkiCAPath(trimmedName), 'crl'], value: firstCrl.trim() },
        label: `set pki ca ${trimmedName} crl '${firstCrl.trim()}'`,
      })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">
        {isCreate ? 'New certificate authority' : `Edit CA ${ca.name}`}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Name *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">This CA already exists.</span>}
        </label>
        <label className={labelClass}>
          Description
          <input
            {...noExtensionInputProps}
            value={values.description}
            onChange={(e) => update('description', e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className={`${labelClass} mt-3`}>
        Certificate (PEM, single line, no BEGIN/END markers)
        <textarea
          value={values.certificate}
          onChange={(e) => update('certificate', e.target.value)}
          placeholder="MIIB..."
          rows={3}
          className={textareaClass}
        />
      </label>

      <label className={`${labelClass} mt-3`}>
        Private key {!isCreate && ca.hasPrivateKey ? '(configured - leave blank to keep)' : ''}
        <textarea
          value={values.privateKey}
          onChange={(e) => update('privateKey', e.target.value)}
          placeholder={!isCreate && ca.hasPrivateKey ? '••••••••' : 'MIIE... (PEM, single line, no BEGIN/END markers)'}
          rows={3}
          className={textareaClass}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.passwordProtected}
            onChange={(e) => update('passwordProtected', e.target.checked)}
            className="accent-accent-500"
          />
          Private key is password-protected
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.systemInstall}
            onChange={(e) => update('systemInstall', e.target.checked)}
            className="accent-accent-500"
          />
          Install into system CA store
          <InfoTooltip text="Adds this CA to the router's own OS-level trust store, so other system services (not just VyOS features that reference this CA by name) trust certificates it issued too." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.revoked}
            onChange={(e) => update('revoked', e.target.checked)}
            className="accent-accent-500"
          />
          Revoked
          <InfoTooltip text="Marks this CA as revoked in VyOS's own PKI store - a local record, not something that publishes a revocation to relying parties elsewhere." />
        </label>
      </div>

      {isCreate && (
        <label className={`${labelClass} mt-3`}>
          First CRL (optional, PEM, single line)
          <textarea
            value={firstCrl}
            onChange={(e) => setFirstCrl(e.target.value)}
            placeholder="MIIC... (PEM, single line)"
            rows={2}
            className={textareaClass}
          />
        </label>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue CA creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
