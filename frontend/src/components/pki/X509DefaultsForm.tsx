import { useState } from 'react'
import {
  x509DefaultsFormToOps,
  x509DefaultsToFormValues,
  type PKIX509DefaultsFormValues,
} from '../../lib/pkiX509DefaultsForm'
import type { PKIX509Defaults } from '../../lib/pkiTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'

/** Default X.509 subject fields (country/state/locality/organization)
 * - only meaningful to VyOS's own `generate pki ...` CLI flow (they
 * pre-fill its interactive prompts), which this app doesn't wrap (see
 * pkiTypes.ts's doc comment), but a small flat form, cheap to
 * include for anyone who still runs `generate` from the CLI. */
export default function X509DefaultsForm({ defaults }: { defaults: PKIX509Defaults }) {
  const [values, setValues] = useState<PKIX509DefaultsFormValues>(() => x509DefaultsToFormValues(defaults))
  const [dirty, setDirty] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  function update(key: keyof PKIX509DefaultsFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
    setDirty(true)
  }

  function submit() {
    const ops = x509DefaultsFormToOps(defaults, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setDirty(false)
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-slate-500">
        X.509 default subject fields
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        Pre-fills the interactive prompts of VyOS's own <code>generate pki ...</code> CLI commands
        - has no effect on certificates pasted in directly above.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FieldLabel
          label="Country"
          hint="These four fields fill in a certificate's X.509 Distinguished Name (subject identity). Country must be a two-letter ISO code (e.g. GB, US), not a full country name."
        >
          <input
            {...noExtensionInputProps}
            value={values.country}
            onChange={(e) => update('country', e.target.value)}
            placeholder="GB"
            className={inputClass}
          />
        </FieldLabel>
        <label className={labelClass}>
          State
          <input
            {...noExtensionInputProps}
            value={values.state}
            onChange={(e) => update('state', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Locality
          <input
            {...noExtensionInputProps}
            value={values.locality}
            onChange={(e) => update('locality', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Organization
          <input
            {...noExtensionInputProps}
            value={values.organization}
            onChange={(e) => update('organization', e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <button onClick={submit} disabled={!dirty} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Save defaults
      </button>
    </div>
  )
}
