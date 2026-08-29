import { useState } from 'react'
import ChipList from '../ChipList'
import { mdnsRepeaterPath } from '../../lib/serviceMdnsParse'
import {
  blankMdnsRepeaterFormValues,
  disableMdnsRepeaterOp,
  enableMdnsRepeaterOp,
  mdnsConfigToFormValues,
  mdnsRepeaterFormToOps,
} from '../../lib/serviceMdnsForm'
import { MDNS_IP_VERSIONS, type MdnsRepeaterConfig } from '../../lib/serviceMdnsTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function MdnsSettings({ config }: { config: MdnsRepeaterConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">The mDNS repeater is not configured.</p>
        <button
          onClick={() => {
            const op = enableMdnsRepeaterOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable mDNS repeater
        </button>
      </div>
    )
  }

  return <MdnsSettingsForm config={config} />
}

function MdnsSettingsForm({ config }: { config: MdnsRepeaterConfig }) {
  const [values, setValues] = useState(() => mdnsConfigToFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankMdnsRepeaterFormValues>>(
    key: K,
    value: ReturnType<typeof blankMdnsRepeaterFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = mdnsRepeaterFormToOps(config, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDisable() {
    const op = disableMdnsRepeaterOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="IP version" hint="Which address family's mDNS traffic (link-local multicast on port 5353) gets repeated between the interfaces below.">
            <select value={values.ipVersion} onChange={(e) => update('ipVersion', e.target.value)} className={inputClass}>
              <option value="">Default (both)</option>
              {MDNS_IP_VERSIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Cache entries" hint="Maximum number of discovered mDNS records the repeater keeps in memory at once.">
            <input {...noExtensionInputProps} value={values.cacheEntries} onChange={(e) => update('cacheEntries', e.target.value)} placeholder="4096" className={inputClass} />
          </FieldLabel>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.disabled} onChange={(e) => update('disabled', e.target.checked)} className="accent-accent-500" />
            Disable mDNS repeater
            <InfoTooltip text="Keeps the interfaces/domains/services below configured without actually forwarding any multicast DNS traffic." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.vrrpDisable} onChange={(e) => update('vrrpDisable', e.target.checked)} className="accent-accent-500" />
            Disable on non-MASTER VRRP interfaces
            <InfoTooltip text="On a VRRP-protected interface, only the currently active (MASTER) router repeats mDNS traffic - avoids both nodes in a failover pair flooding duplicate announcements." />
          </label>
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save settings
        </button>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Interfaces</p>
            <ChipList values={config.interfaces} basePath={mdnsRepeaterPath()} leaf="interface" pathLabel="service mdns repeater interface" placeholder="eth0" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Browse domains</p>
            <ChipList values={config.browseDomains} basePath={mdnsRepeaterPath()} leaf="browse-domain" pathLabel="service mdns repeater browse-domain" placeholder="example.com" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Allowed services</p>
            <ChipList values={config.allowServices} basePath={mdnsRepeaterPath()} leaf="allow-service" pathLabel="service mdns repeater allow-service" placeholder="_http._tcp" />
          </div>
        </div>
      </div>

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable mDNS repeater entirely
        </button>
      </div>
    </div>
  )
}
