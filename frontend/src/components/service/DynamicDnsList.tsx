import { useState } from 'react'
import ChipList from '../ChipList'
import { dynamicDnsEntryPath } from '../../lib/serviceDnsDynamicParse'
import {
  blankDynamicDNSEntryFormValues,
  blankDynamicDNSGlobalFormValues,
  deleteDynamicDNSEntryOp,
  dynamicDNSEntryFormToOps,
  dynamicDNSEntryToFormValues,
  dynamicDNSGlobalFormToOps,
  dynamicDNSGlobalToFormValues,
  type DynamicDNSEntryFormValues,
} from '../../lib/serviceDnsDynamicForm'
import { DYNAMIC_DNS_IP_VERSIONS, type DynamicDNSConfig, type DynamicDNSEntry } from '../../lib/serviceDnsDynamicTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function DynamicDnsList({ config }: { config: DynamicDNSConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(name: string) {
    const op = deleteDynamicDNSEntryOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? config.entries.find((e) => e.name === editingName) : undefined

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Dynamic DNS entries ({config.entries.length})
          </h2>
          <button
            onClick={() => {
              setShowCreate((v) => !v)
              setEditingName(null)
            }}
            className={`bg-accent-600 ${buttonClass}`}
          >
            {showCreate ? 'Cancel' : '+ New entry'}
          </button>
        </div>

        {showCreate && (
          <div className="mb-3">
            <EntryForm existingNames={config.entries.map((e) => e.name)} onDone={() => setShowCreate(false)} />
          </div>
        )}
        {editing && (
          <div className="mb-3">
            <EntryForm
              entry={editing}
              existingNames={config.entries.map((e) => e.name)}
              onDone={() => setEditingName(null)}
            />
          </div>
        )}

        <div className="space-y-3">
          {config.entries.map((entry) => (
            <div key={entry.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-medium text-white">{entry.name}</span>
                  <p className="text-xs text-slate-400">
                    {entry.protocol || 'no protocol set'}
                    {entry.addressMode === 'interface' && ` · via ${entry.addressInterface ?? '?'}`}
                    {entry.addressMode === 'web' && ' · via web lookup'}
                    {entry.hasPassword && ' · password set'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <button
                    onClick={() => {
                      setEditingName(entry.name)
                      setShowCreate(false)
                    }}
                    className="text-accent-500 hover:text-accent-400"
                  >
                    Edit
                  </button>
                  <button onClick={() => queueDelete(entry.name)} className="text-slate-500 hover:text-danger-500">
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <p className="mb-1 text-xs text-slate-500">Host names</p>
                <ChipList
                  values={entry.hostNames}
                  basePath={dynamicDnsEntryPath(entry.name)}
                  leaf="host-name"
                  pathLabel={`service dns dynamic name ${entry.name} host-name`}
                  placeholder="home.example.com"
                />
              </div>
            </div>
          ))}
          {config.entries.length === 0 && <p className="text-xs text-slate-500">No entries configured yet.</p>}
        </div>
      </div>

      <GlobalSettings config={config} />
    </div>
  )
}

function EntryForm({
  entry,
  existingNames,
  onDone,
}: {
  entry?: DynamicDNSEntry
  existingNames: string[]
  onDone: () => void
}) {
  const [name, setName] = useState(entry?.name ?? '')
  const [values, setValues] = useState<DynamicDNSEntryFormValues>(
    entry ? dynamicDNSEntryToFormValues(entry) : blankDynamicDNSEntryFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = entry === undefined
  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof DynamicDNSEntryFormValues>(key: K, value: DynamicDNSEntryFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = dynamicDNSEntryFormToOps(trimmedName, entry, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New entry' : `Edit ${entry.name}`}</h3>
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
          {nameTaken && <span className="text-danger-500">This entry already exists.</span>}
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
        <FieldLabel
          label="Protocol"
          hint="Which ddclient driver to use for this provider - VyOS forwards this string directly to ddclient, so it must match one of ddclient's supported provider names exactly."
        >
          <input
            {...noExtensionInputProps}
            value={values.protocol}
            onChange={(e) => update('protocol', e.target.value)}
            placeholder="cloudflare, dyndns2, duckdns, ..."
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="IP version" hint="Which address family to publish for the host names below - 'both' updates separate A and AAAA records where the provider supports it.">
          <select value={values.ipVersion} onChange={(e) => update('ipVersion', e.target.value)} className={inputClass}>
            <option value="">Default (ipv4)</option>
            {DYNAMIC_DNS_IP_VERSIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Server" hint="Overrides the provider's default update endpoint - normally only needed for self-hosted DDNS services or custom RFC 2136 servers.">
          <input
            {...noExtensionInputProps}
            value={values.server}
            onChange={(e) => update('server', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Zone" hint="The parent DNS zone the published host names belong to - required by providers such as Cloudflare that manage records per-zone rather than per-hostname.">
          <input
            {...noExtensionInputProps}
            value={values.zone}
            onChange={(e) => update('zone', e.target.value)}
            className={inputClass}
          />
        </FieldLabel>
        <label className={labelClass}>
          Username
          <input
            {...noExtensionInputProps}
            value={values.username}
            onChange={(e) => update('username', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Password {!isCreate && entry.hasPassword ? '(configured - leave blank to keep)' : ''}
          <input
            {...noExtensionInputProps}
            type="password"
            value={values.password}
            onChange={(e) => update('password', e.target.value)}
            className={inputClass}
          />
        </label>
        <FieldLabel
          label="TSIG key file path"
          hint="Path on the router to a pre-shared secret file used to cryptographically sign updates - only used by the RFC 2136 ('nsupdate') protocol, not by third-party cloud providers."
        >
          <input
            {...noExtensionInputProps}
            value={values.key}
            onChange={(e) => update('key', e.target.value)}
            placeholder="/config/auth/ddns.key"
            className={inputClass}
          />
        </FieldLabel>
        <label className={labelClass}>
          TTL (s)
          <input
            {...noExtensionInputProps}
            value={values.ttl}
            onChange={(e) => update('ttl', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Wait time (s)
          <input
            {...noExtensionInputProps}
            value={values.waitTime}
            onChange={(e) => update('waitTime', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Expiry time (s)
          <input
            {...noExtensionInputProps}
            value={values.expiryTime}
            onChange={(e) => update('expiryTime', e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3">
        <p className="mb-1 flex items-center gap-1 text-xs text-slate-500">
          How to determine the address to publish
          <InfoTooltip text="A local interface reads the address directly off that interface (works even without internet reachability); a web lookup queries an external service to learn the address as seen from outside - useful when this router is behind another NAT." />
        </p>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input
              type="radio"
              checked={values.addressMode === 'interface'}
              onChange={() => update('addressMode', 'interface')}
              className="accent-accent-500"
            />
            From a local interface
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input
              type="radio"
              checked={values.addressMode === 'web'}
              onChange={() => update('addressMode', 'web')}
              className="accent-accent-500"
            />
            From a web lookup
          </label>
        </div>
        {values.addressMode === 'interface' && (
          <input
            {...noExtensionInputProps}
            value={values.addressInterface}
            onChange={(e) => update('addressInterface', e.target.value)}
            placeholder="eth0"
            className={`mt-2 w-full ${inputClass}`}
          />
        )}
        {values.addressMode === 'web' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              {...noExtensionInputProps}
              value={values.addressWebUrl}
              onChange={(e) => update('addressWebUrl', e.target.value)}
              placeholder="https://checkip.example.com"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={values.addressWebSkip}
              onChange={(e) => update('addressWebSkip', e.target.value)}
              placeholder="skip pattern (optional)"
              className={inputClass}
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue entry creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

function GlobalSettings({ config }: { config: DynamicDNSConfig }) {
  const [values, setValues] = useState(() => dynamicDNSGlobalToFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankDynamicDNSGlobalFormValues>>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = dynamicDNSGlobalFormToOps(config, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Global settings</h2>
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Polling interval (s)" hint="How often ddclient re-checks the current address and pushes an update if it has changed.">
            <input
              {...noExtensionInputProps}
              value={values.interval}
              onChange={(e) => update('interval', e.target.value)}
              placeholder="300"
              className={inputClass}
            />
          </FieldLabel>
          <label className={labelClass}>
            VRF
            <input
              {...noExtensionInputProps}
              value={values.vrf}
              onChange={(e) => update('vrf', e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save global settings
        </button>
      </div>
    </div>
  )
}
