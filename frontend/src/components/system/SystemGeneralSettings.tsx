import { useState } from 'react'
import ChipList from '../ChipList'
import { generalFormToOps, generalToFormValues, type SystemGeneralFormValues } from '../../lib/systemGeneralForm'
import { systemPath } from '../../lib/systemParse'
import type { SystemGeneralSettings as SystemGeneralSettingsData } from '../../lib/systemTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

/** Host name, domain name, time zone, DNS name servers, and domain
 * search order - the identity/DNS settings someone would realistically
 * configure once early on. Everything else under `system` beyond this
 * page, the Users page, and the Syslog page (sysctl, conntrack tuning,
 * IP/IPv6 global options, task scheduler, console, watchdog, LCD,
 * flow-accounting, sFlow, acceleration, system proxy, ...) stays
 * Config-Tree-only - see docs/roadmap.md. */
export default function SystemGeneralSettings({ settings }: { settings: SystemGeneralSettingsData }) {
  const [values, setValues] = useState<SystemGeneralFormValues>(() => generalToFormValues(settings))
  const [dirty, setDirty] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof SystemGeneralFormValues>(key: K, value: SystemGeneralFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    setDirty(true)
  }

  function submit() {
    const ops = generalFormToOps(settings, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setDirty(false)
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
        Identity &amp; DNS
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Host name
          <input
            {...noExtensionInputProps}
            value={values.hostName}
            onChange={(e) => update('hostName', e.target.value)}
            placeholder="vyos"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Domain name
          <input
            {...noExtensionInputProps}
            value={values.domainName}
            onChange={(e) => update('domainName', e.target.value)}
            placeholder="example.com"
            className={inputClass}
          />
        </label>
        <FieldLabel label="Time zone" hint="An IANA time zone name, e.g. America/New_York or Europe/Berlin - not just an abbreviation or UTC offset.">
          <input
            {...noExtensionInputProps}
            value={values.timeZone}
            onChange={(e) => update('timeZone', e.target.value)}
            placeholder="UTC"
            className={inputClass}
          />
        </FieldLabel>
      </div>
      <button onClick={submit} disabled={!dirty} className={`mt-3 bg-accent-600 ${buttonClass}`}>
        Save identity settings
      </button>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-slate-500">DNS name servers</p>
          <ChipList
            values={settings.nameServers}
            basePath={systemPath()}
            leaf="name-server"
            pathLabel="system name-server"
            placeholder="1.1.1.1"
          />
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
            Domain search order
            <InfoTooltip text="When resolving an unqualified name (e.g. just 'printer', not 'printer.example.com'), each of these suffixes is tried in order until one resolves." />
          </p>
          <ChipList
            values={settings.domainSearch}
            basePath={systemPath()}
            leaf="domain-search"
            pathLabel="system domain-search"
            placeholder="example.com"
          />
        </div>
      </div>
    </div>
  )
}
