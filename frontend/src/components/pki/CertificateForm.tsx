import { useState } from 'react'
import {
  blankCertificateFormValues,
  certificateFormToOps,
  certificateToFormValues,
  type PKICertificateFormValues,
} from '../../lib/pkiCertificateForm'
import type { PKICertificate } from '../../lib/pkiTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

const textareaClass =
  'w-full rounded border border-surface-border bg-surface-800 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-accent-500'

interface CertificateFormProps {
  /** undefined = creating a new certificate. */
  certificate?: PKICertificate
  existingNames: string[]
  onDone: () => void
}

type Tab = 'basic' | 'acme'

export default function CertificateForm({ certificate, existingNames, onDone }: CertificateFormProps) {
  const [tab, setTab] = useState<Tab>('basic')
  const [name, setName] = useState(certificate?.name ?? '')
  const [values, setValues] = useState<PKICertificateFormValues>(
    certificate ? certificateToFormValues(certificate) : blankCertificateFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = certificate === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof PKICertificateFormValues>(key: K, value: PKICertificateFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = certificateFormToOps(trimmedName, certificate, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">
          {isCreate ? 'New certificate' : `Edit certificate ${certificate.name}`}
        </h3>
        <div className="flex gap-1 rounded-lg border border-surface-border bg-surface-800 p-0.5 text-xs">
          {(['basic', 'acme'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 font-medium uppercase ${
                tab === t ? 'bg-accent-600 text-white' : 'text-slate-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'basic' && (
        <>
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
              {nameTaken && <span className="text-danger-500">This certificate already exists.</span>}
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
            Private key{' '}
            {!isCreate && certificate.hasPrivateKey ? '(configured - leave blank to keep)' : ''}
            <textarea
              value={values.privateKey}
              onChange={(e) => update('privateKey', e.target.value)}
              placeholder={
                !isCreate && certificate.hasPrivateKey
                  ? '••••••••'
                  : 'MIIE... (PEM, single line, no BEGIN/END markers)'
              }
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
                checked={values.revoked}
                onChange={(e) => update('revoked', e.target.checked)}
                className="accent-accent-500"
              />
              Revoked
              <InfoTooltip text="Marks this certificate as revoked in VyOS's own PKI store - a local record, not something that publishes a revocation to relying parties elsewhere." />
            </label>
          </div>
        </>
      )}

      {tab === 'acme' && (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Email
            <input
              {...noExtensionInputProps}
              value={values.acmeEmail}
              onChange={(e) => update('acmeEmail', e.target.value)}
              placeholder="admin@example.com"
              className={inputClass}
            />
          </label>
          <FieldLabel
            label="Listen address"
            hint="The address VyOS's built-in web server binds to answer the ACME 'http-01' domain-ownership challenge - the CA connects here on port 80 to verify you control the domain."
          >
            <input
              {...noExtensionInputProps}
              value={values.acmeListenAddress}
              onChange={(e) => update('acmeListenAddress', e.target.value)}
              placeholder="for the http-01 challenge"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="RSA key size" hint="The key size for the certificate ACME issues - larger is more secure but slower; 2048 bits is the common, still-secure default.">
            <select
              value={values.acmeRsaKeySize}
              onChange={(e) =>
                update('acmeRsaKeySize', e.target.value as PKICertificateFormValues['acmeRsaKeySize'])
              }
              className={inputClass}
            >
              <option value="">(default: 2048)</option>
              <option value="2048">2048</option>
              <option value="3072">3072</option>
              <option value="4096">4096</option>
            </select>
          </FieldLabel>
          <FieldLabel
            label="Directory URL"
            hint="The ACME server's API entry point - override this to use a different CA (e.g. a staging environment for testing) instead of Let's Encrypt's production service."
          >
            <input
              {...noExtensionInputProps}
              value={values.acmeUrl}
              onChange={(e) => update('acmeUrl', e.target.value)}
              placeholder="(default: Let's Encrypt production)"
              className={inputClass}
            />
          </FieldLabel>
          <p className="col-span-2 text-xs text-slate-500">
            Domain names are managed on the certificate's own card once created, since at least one
            is required for ACME to do anything meaningful.
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue certificate creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
