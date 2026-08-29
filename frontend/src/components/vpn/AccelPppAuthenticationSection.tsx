import { useState } from 'react'
import { accelPppConfigToSettingsFormValues, accelPppSettingsFormToOps, type AccelPppSettingsFormValues } from '../../lib/vpnAccelPppForm'
import { ACCEL_PPP_AUTH_MODES, ACCEL_PPP_PROTOCOLS, type AccelPppConfig, type AccelPppKind } from '../../lib/vpnAccelPppTypes'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import AccelPppLocalUsersSubsection from './AccelPppLocalUsersSubsection'
import AccelPppRadiusServersSubsection from './AccelPppRadiusServersSubsection'

/** AccelPppServer.tsx's "Authentication" section - one of that
 * component's several sections, extracted into its own file for size
 * (see AccelPppServer.tsx's own doc comment for why it's split this
 * way). Includes its own two subsections (local users, RADIUS
 * servers), each further extracted into their own files. */
export default function AccelPppAuthenticationSection({ kind, config }: { kind: AccelPppKind; config: AccelPppConfig }) {
  const [values, setValues] = useState<AccelPppSettingsFormValues>(() => accelPppConfigToSettingsFormValues(config))
  const add = usePendingChangesStore((s) => s.add)
  const { authentication } = config

  function toggleProtocol(protocol: string) {
    setValues((v) => ({
      ...v,
      authProtocols: v.authProtocols.includes(protocol)
        ? v.authProtocols.filter((p) => p !== protocol)
        : [...v.authProtocols, protocol],
    }))
  }

  function save() {
    const ops = accelPppSettingsFormToOps(kind, config, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Authentication</h2>
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
          <FieldLabel
            label="Mode"
            hint="local checks the users list below; radius defers to the RADIUS servers configured further down; noauth accepts any client without checking credentials at all."
          >
            <select value={values.authMode} onChange={(e) => setValues((v) => ({ ...v, authMode: e.target.value }))} className={inputClass}>
              <option value="">Default (local)</option>
              {ACCEL_PPP_AUTH_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </FieldLabel>
          <label className={labelClass}>
            RADIUS accounting interval (s)
            <input {...noExtensionInputProps} value={values.radiusAccountingInterimInterval} onChange={(e) => setValues((v) => ({ ...v, radiusAccountingInterimInterval: e.target.value }))} className={inputClass} />
          </label>
          <label className={labelClass}>
            RADIUS timeout (s)
            <input {...noExtensionInputProps} value={values.radiusTimeout} onChange={(e) => setValues((v) => ({ ...v, radiusTimeout: e.target.value }))} placeholder="3" className={inputClass} />
          </label>
          <label className={labelClass}>
            RADIUS NAS identifier
            <input {...noExtensionInputProps} value={values.radiusNasIdentifier} onChange={(e) => setValues((v) => ({ ...v, radiusNasIdentifier: e.target.value }))} className={inputClass} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span className="text-xs text-slate-500">Allowed protocols</span>
          <InfoTooltip text="Which PPP authentication protocols to accept. pap sends passwords in the clear inside the PPP session; chap/mschap/mschap-v2 use a challenge-response instead - mschap-v2 is the strongest of the four." />
          {ACCEL_PPP_PROTOCOLS.map((protocol) => (
            <label key={protocol} className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={values.authProtocols.includes(protocol)} onChange={() => toggleProtocol(protocol)} className="accent-accent-500" />
              {protocol}
            </label>
          ))}
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>Save settings</button>

        <AccelPppLocalUsersSubsection kind={kind} config={config} />
        <AccelPppRadiusServersSubsection kind={kind} config={config} />
      </div>

      {authentication.protocols.length === 0 && (
        <p className="mt-1 text-xs text-slate-500">No protocols selected: VyOS defaults to allowing all four.</p>
      )}
    </div>
  )
}
