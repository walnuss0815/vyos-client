import { useState } from 'react'
import {
  addHAProxyListenAddressOps,
  addHAProxyServiceRuleOps,
  blankHAProxyServiceFormValues,
  deleteHAProxyServiceOp,
  haproxyServiceFormToOps,
  haproxyServiceToFormValues,
  removeHAProxyListenAddressOp,
  removeHAProxyServiceRuleOp,
  type HAProxyServiceFormValues,
} from '../../lib/loadBalancingHaproxyForm'
import { haproxyServicePath } from '../../lib/loadBalancingParse'
import {
  HAPROXY_LOG_FACILITIES,
  HAPROXY_LOG_LEVELS,
  HAPROXY_MODES,
  type HAProxyBackend,
  type HAProxyService,
} from '../../lib/loadBalancingTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ChipList from '../ChipList'
import KeyValuePairList from '../KeyValuePairList'
import FieldLabel from '../FieldLabel'

/** `service <name>` (HAProxy frontend) list - each service listens on
 * one or more addresses/a port and routes to one or more named
 * backends (see HaproxyBackendList.tsx for the backends themselves,
 * fetched from the same useLoadBalancingConfig() hook so the backend
 * picker below is a real dropdown of sibling tagNode names). */
export default function HaproxyServiceList({
  services,
  backends,
}: {
  services: HAProxyService[]
  backends: HAProxyBackend[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = services.map((s) => s.name)

  function queueDelete(name: string) {
    add({ op: deleteHAProxyServiceOp(name), label: `delete load-balancing haproxy service ${name}` })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Services (frontends)</p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditing(null)
            setNewName('')
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add service'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-surface-border bg-surface-900 p-4">
          <label className={`${labelClass} mb-3`}>
            Name
            <input
              {...noExtensionInputProps}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="web"
              className={`font-mono ${inputClass}`}
            />
          </label>
          {newName.trim() !== '' && !existingNames.includes(newName.trim()) && (
            <HaproxyServiceFormPanel name={newName.trim()} backends={backends} onDone={() => setShowAdd(false)} />
          )}
        </div>
      )}

      {services.length === 0 && !showAdd && <p className="text-xs text-slate-500">No services configured yet.</p>}

      <div className="space-y-3">
        {services.map((service) => (
          <div key={service.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            {editing === service.name ? (
              <HaproxyServiceFormPanel
                name={service.name}
                service={service}
                backends={backends}
                onDone={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-white">
                    {service.name}
                    {service.port !== undefined && <span className="ml-2 text-xs text-slate-400">:{service.port}</span>}
                  </span>
                  <div>
                    <button
                      onClick={() => {
                        setEditing(service.name)
                        setShowAdd(false)
                      }}
                      className="text-xs text-accent-500 hover:text-accent-400"
                    >
                      Edit
                    </button>{' '}
                    <button
                      onClick={() => queueDelete(service.name)}
                      className="ml-2 text-xs text-slate-500 hover:text-danger-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  {service.mode} · backends: {service.backends.join(', ') || '(none)'}
                </p>
                {service.description && <p className="text-xs text-slate-400">{service.description}</p>}

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <HaproxyListenAddressesSection service={service} />
                  <HaproxyServiceRulesSection service={service} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <KeyValuePairList
                    items={service.httpResponseHeaders}
                    basePath={[...haproxyServicePath(service.name), 'http-response-headers']}
                    pathLabel={`... service ${service.name} http-response-headers`}
                    idPlaceholder="header name"
                    valuePlaceholder="header value"
                  />
                  <div className="space-y-2">
                    <ChipList
                      values={service.sslCertificates}
                      basePath={[...haproxyServicePath(service.name), 'ssl']}
                      leaf="certificate"
                      pathLabel={`... service ${service.name} ssl certificate`}
                      placeholder="PKI certificate name"
                    />
                    <ChipList
                      values={service.httpCompressionMimeTypes}
                      basePath={[...haproxyServicePath(service.name), 'http-compression']}
                      leaf="mime-type"
                      pathLabel={`... service ${service.name} http-compression mime-type`}
                      placeholder="text/html"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function HaproxyServiceFormPanel({
  name,
  service,
  backends,
  onDone,
}: {
  name: string
  service?: HAProxyService
  backends: HAProxyBackend[]
  onDone: () => void
}) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<HAProxyServiceFormValues>(
    service ? haproxyServiceToFormValues(service) : blankHAProxyServiceFormValues(),
  )
  const [selectedBackends, setSelectedBackends] = useState<string[]>(service?.backends ?? [])

  function update<K extends keyof HAProxyServiceFormValues>(key: K, value: HAProxyServiceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function toggleBackend(backendName: string) {
    setSelectedBackends((cur) =>
      cur.includes(backendName) ? cur.filter((b) => b !== backendName) : [...cur, backendName],
    )
  }

  function submit() {
    const ops = haproxyServiceFormToOps(name, service, values)
    const base = haproxyServicePath(name)
    const before = new Set(service?.backends ?? [])
    const after = new Set(selectedBackends)
    for (const b of after) if (!before.has(b)) ops.push({ op: 'set', path: [...base, 'backend'], value: b })
    for (const b of before) if (!after.has(b)) ops.push({ op: 'delete', path: [...base, 'backend'], value: b })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    onDone()
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Description
          <input
            {...noExtensionInputProps}
            value={values.description}
            onChange={(e) => update('description', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Mode
          <select value={values.mode} onChange={(e) => update('mode', e.target.value)} className={inputClass}>
            {HAPROXY_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Port
          <input
            {...noExtensionInputProps}
            value={values.port}
            onChange={(e) => update('port', e.target.value)}
            placeholder="443"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Client timeout (seconds, optional)
          <input
            {...noExtensionInputProps}
            value={values.timeoutClient}
            onChange={(e) => update('timeoutClient', e.target.value)}
            placeholder="uses the global default if blank"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Backends</p>
        <div className="flex flex-wrap gap-3">
          {backends.length === 0 && <p className="text-xs text-slate-500">No backends defined yet.</p>}
          {backends.map((b) => (
            <label key={b.name} className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={selectedBackends.includes(b.name)}
                onChange={() => toggleBackend(b.name)}
                className="accent-accent-500"
              />
              {b.name}
            </label>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.redirectHttpToHttps}
            onChange={(e) => update('redirectHttpToHttps', e.target.checked)}
            className="accent-accent-500"
          />
          Redirect HTTP to HTTPS
        </label>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FieldLabel label="Log facility (optional)">
          <select
            value={values.loggingFacility}
            onChange={(e) => update('loggingFacility', e.target.value)}
            className={inputClass}
          >
            <option value="">(none)</option>
            {HAPROXY_LOG_FACILITIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          Log level
          <select value={values.loggingLevel} onChange={(e) => update('loggingLevel', e.target.value)} className={inputClass}>
            {HAPROXY_LOG_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <FieldLabel
          label="Compression algorithm (optional)"
          hint="Requires HTTP mode and at least one MIME type below to actually take effect."
        >
          <input
            {...noExtensionInputProps}
            value={values.httpCompressionAlgorithm}
            onChange={(e) => update('httpCompressionAlgorithm', e.target.value)}
            placeholder="gzip"
            className={inputClass}
          />
        </FieldLabel>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
          {service ? 'Save' : 'Add service'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  )
}

function HaproxyListenAddressesSection({ service }: { service: HAProxyService }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [acceptProxy, setAcceptProxy] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = address.trim()
  const taken = service.listenAddresses.some((a) => a.address === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addHAProxyListenAddressOps(service.name, trimmed, acceptProxy)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setAcceptProxy(false)
    setShowAdd(false)
  }

  function queueRemove(a: string) {
    const op = removeHAProxyListenAddressOp(service.name, a)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Listen addresses</p>
      {service.listenAddresses.map((la) => (
        <div key={la.address} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {la.address}
            {la.acceptProxy && ' (PROXY protocol)'}
          </span>
          <button onClick={() => queueRemove(la.address)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {service.listenAddresses.length === 0 && <p className="text-xs text-slate-500">None - listens on all addresses.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add address'}
      </button>
      {showAdd && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            {...noExtensionInputProps}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0.0.0.0 or ::"
            className={`font-mono ${inputClass}`}
          />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={acceptProxy}
              onChange={(e) => setAcceptProxy(e.target.checked)}
              className="accent-accent-500"
            />
            Accept PROXY protocol
          </label>
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}

function HaproxyServiceRulesSection({ service }: { service: HAProxyService }) {
  const [showAdd, setShowAdd] = useState(false)
  const [domainNames, setDomainNames] = useState('')
  const [urlPathBegin, setUrlPathBegin] = useState('')
  const [setBackend, setSetBackend] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const nextId = String(service.rules.reduce((max, r) => Math.max(max, Number(r.id)), 0) + 1)

  function submit() {
    const ops = addHAProxyServiceRuleOps(service.name, nextId, {
      domainNames,
      wildcardDomain: false,
      ssl: '',
      urlPathBegin,
      urlPathEnd: '',
      urlPathExact: '',
      setRedirectLocation: '',
      setBackend,
      setServer: '',
    })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setDomainNames('')
    setUrlPathBegin('')
    setSetBackend('')
    setShowAdd(false)
  }

  function queueRemove(ruleId: string) {
    const op = removeHAProxyServiceRuleOp(service.name, ruleId)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Routing rules</p>
      {service.rules.map((rule) => (
        <div key={rule.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            #{rule.id} {rule.domainNames.join(',')}
            {rule.setBackend && ` -> ${rule.setBackend}`}
          </span>
          <button onClick={() => queueRemove(rule.id)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {service.rules.length === 0 && <p className="text-xs text-slate-500">No routing rules - all traffic goes to every listed backend.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add rule'}
      </button>
      {showAdd && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            {...noExtensionInputProps}
            value={domainNames}
            onChange={(e) => setDomainNames(e.target.value)}
            placeholder="example.com, www.example.com"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={urlPathBegin}
            onChange={(e) => setUrlPathBegin(e.target.value)}
            placeholder="URL path begins with (optional)"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={setBackend}
            onChange={(e) => setSetBackend(e.target.value)}
            placeholder="route to backend name"
            className={`font-mono ${inputClass}`}
          />
          <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
            Add rule
          </button>
        </div>
      )}
    </div>
  )
}
