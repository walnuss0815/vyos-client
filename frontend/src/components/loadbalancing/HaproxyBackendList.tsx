import { useState } from 'react'
import {
  addHAProxyBackendRuleOps,
  addHAProxyServerOps,
  blankHAProxyBackendFormValues,
  deleteHAProxyBackendOp,
  haproxyBackendFormToOps,
  haproxyBackendToFormValues,
  removeHAProxyBackendRuleOp,
  removeHAProxyServerOp,
  type HAProxyBackendFormValues,
} from '../../lib/loadBalancingHaproxyForm'
import { haproxyBackendPath } from '../../lib/loadBalancingParse'
import {
  HAPROXY_BALANCE_ALGORITHMS,
  HAPROXY_HEALTH_CHECK_TYPES,
  HAPROXY_HTTP_CHECK_METHODS,
  HAPROXY_LOG_FACILITIES,
  HAPROXY_LOG_LEVELS,
  HAPROXY_MODES,
  type HAProxyBackend,
} from '../../lib/loadBalancingTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import KeyValuePairList from '../KeyValuePairList'
import FieldLabel from '../FieldLabel'

/** `backend <name>` list - a pool of one or more real servers HAProxy
 * distributes traffic to, referenced by name from one or more
 * services (see HaproxyServiceList.tsx). */
export default function HaproxyBackendList({ backends }: { backends: HAProxyBackend[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = backends.map((b) => b.name)

  function queueDelete(name: string) {
    add({ op: deleteHAProxyBackendOp(name), label: `delete load-balancing haproxy backend ${name}` })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Backends</p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditing(null)
            setNewName('')
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add backend'}
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
              placeholder="app-servers"
              className={`font-mono ${inputClass}`}
            />
          </label>
          {newName.trim() !== '' && !existingNames.includes(newName.trim()) && (
            <HaproxyBackendFormPanel name={newName.trim()} onDone={() => setShowAdd(false)} />
          )}
        </div>
      )}

      {backends.length === 0 && !showAdd && <p className="text-xs text-slate-500">No backends configured yet.</p>}

      <div className="space-y-3">
        {backends.map((backend) => (
          <div key={backend.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            {editing === backend.name ? (
              <HaproxyBackendFormPanel name={backend.name} backend={backend} onDone={() => setEditing(null)} />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-white">{backend.name}</span>
                  <div>
                    <button
                      onClick={() => {
                        setEditing(backend.name)
                        setShowAdd(false)
                      }}
                      className="text-xs text-accent-500 hover:text-accent-400"
                    >
                      Edit
                    </button>{' '}
                    <button
                      onClick={() => queueDelete(backend.name)}
                      className="ml-2 text-xs text-slate-500 hover:text-danger-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  {backend.mode} · {backend.balance}
                </p>
                {backend.description && <p className="text-xs text-slate-400">{backend.description}</p>}

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <HaproxyServersSection backend={backend} />
                  <HaproxyBackendRulesSection backend={backend} />
                </div>
                <div className="mt-3">
                  <KeyValuePairList
                    items={backend.httpResponseHeaders}
                    basePath={[...haproxyBackendPath(backend.name), 'http-response-headers']}
                    pathLabel={`... backend ${backend.name} http-response-headers`}
                    idPlaceholder="header name"
                    valuePlaceholder="header value"
                  />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function HaproxyBackendFormPanel({
  name,
  backend,
  onDone,
}: {
  name: string
  backend?: HAProxyBackend
  onDone: () => void
}) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<HAProxyBackendFormValues>(
    backend ? haproxyBackendToFormValues(backend) : blankHAProxyBackendFormValues(),
  )
  const [initialServerName, setInitialServerName] = useState('')
  const [initialServerAddress, setInitialServerAddress] = useState('')
  const [initialServerPort, setInitialServerPort] = useState('')
  const [firstRuleDomainNames, setFirstRuleDomainNames] = useState('')
  const [firstRuleSetServer, setFirstRuleSetServer] = useState('')

  function update<K extends keyof HAProxyBackendFormValues>(key: K, value: HAProxyBackendFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = haproxyBackendFormToOps(name, backend, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    // VyOS refuses to commit ANY load-balancing haproxy config unless
    // every backend already has at least one server - and
    // HaproxyServersSection (the normal way to add one) only operates
    // on an already-fetched, real backend, so a brand new one has no
    // way to get a server before its own first commit without this.
    // Queuing it here, in the same commit as creation, is what breaks
    // that deadlock (see docs/roadmap.md).
    if (!backend && initialServerName.trim()) {
      const serverOps = addHAProxyServerOps(name, initialServerName.trim(), {
        address: initialServerAddress.trim(),
        port: initialServerPort.trim(),
        backup: false,
        checkPort: '',
        sendProxy: false,
        sendProxyV2: false,
      })
      for (const op of serverOps) {
        add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
      }
    }
    // A backend's routing rules used to only be addable AFTER the
    // backend already existed - HaproxyBackendRulesSection only ever
    // operates on an already-fetched backend. Not a VyOS commit-
    // blocking requirement (unlike the initial server above), but
    // avoids a detour through commit+refetch just to add the first
    // one.
    if (!backend && (firstRuleDomainNames.trim() || firstRuleSetServer.trim())) {
      const ruleOps = addHAProxyBackendRuleOps(name, '1', {
        domainNames: firstRuleDomainNames,
        wildcardDomain: false,
        ssl: '',
        urlPathBegin: '',
        urlPathEnd: '',
        urlPathExact: '',
        setRedirectLocation: '',
        setBackend: '',
        setServer: firstRuleSetServer,
      })
      for (const op of ruleOps) {
        add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
      }
    }
    onDone()
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          Balance algorithm
          <select value={values.balance} onChange={(e) => update('balance', e.target.value)} className={inputClass}>
            {HAPROXY_BALANCE_ALGORITHMS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Health check (HTTP mode - leave blank to skip)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            value={values.httpCheckMethod}
            onChange={(e) => update('httpCheckMethod', e.target.value)}
            className={inputClass}
          >
            <option value="">(none)</option>
            {HAPROXY_HTTP_CHECK_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            {...noExtensionInputProps}
            value={values.httpCheckUri}
            onChange={(e) => update('httpCheckUri', e.target.value)}
            placeholder="/health"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.httpCheckExpectStatus}
            onChange={(e) => update('httpCheckExpectStatus', e.target.value)}
            placeholder="expect status (e.g. 200)"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.httpCheckExpectString}
            onChange={(e) => update('httpCheckExpectString', e.target.value)}
            placeholder="or expect string"
            className={inputClass}
          />
        </div>
        <FieldLabel
          label="Non-HTTP health check (TCP mode only, mutually exclusive with the above)"
          className={`${labelClass} mt-2`}
        >
          <select value={values.healthCheck} onChange={(e) => update('healthCheck', e.target.value)} className={inputClass}>
            <option value="">(none)</option>
            {HAPROXY_HEALTH_CHECK_TYPES.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>

      <div className="mb-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.httpServerClose}
            onChange={(e) => update('httpServerClose', e.target.checked)}
            className="accent-accent-500"
          />
          HTTP/1.x connection close (server side)
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.sslNoVerify}
            onChange={(e) => update('sslNoVerify', e.target.checked)}
            className="accent-accent-500"
          />
          Don't verify backend SSL certificates
        </label>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          SSL CA certificate (optional, PKI name)
          <input
            {...noExtensionInputProps}
            value={values.sslCaCertificate}
            onChange={(e) => update('sslCaCertificate', e.target.value)}
            className={inputClass}
          />
        </label>
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
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Timeouts (seconds, optional - overrides the global defaults)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            {...noExtensionInputProps}
            value={values.timeoutCheck}
            onChange={(e) => update('timeoutCheck', e.target.value)}
            placeholder="check"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.timeoutConnect}
            onChange={(e) => update('timeoutConnect', e.target.value)}
            placeholder="connect"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.timeoutServer}
            onChange={(e) => update('timeoutServer', e.target.value)}
            placeholder="server"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.timeoutTunnel}
            onChange={(e) => update('timeoutTunnel', e.target.value)}
            placeholder="tunnel"
            className={inputClass}
          />
        </div>
      </div>

      {!backend && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            Initial server (optional)
          </p>
          <p className="mb-2 text-xs text-slate-500">
            VyOS requires every backend to have at least one server before it can be committed - add one
            now, or a server via this backend's own card once it exists (but the very first commit needs
            one already present).
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              {...noExtensionInputProps}
              value={initialServerName}
              onChange={(e) => setInitialServerName(e.target.value)}
              placeholder="server name (e.g. app1)"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={initialServerAddress}
              onChange={(e) => setInitialServerAddress(e.target.value)}
              placeholder="10.0.0.5"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={initialServerPort}
              onChange={(e) => setInitialServerPort(e.target.value)}
              placeholder="8080"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {!backend && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            First routing rule (optional)
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              {...noExtensionInputProps}
              value={firstRuleDomainNames}
              onChange={(e) => setFirstRuleDomainNames(e.target.value)}
              placeholder="example.com"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={firstRuleSetServer}
              onChange={(e) => setFirstRuleSetServer(e.target.value)}
              placeholder="route to server name"
              className={`font-mono ${inputClass}`}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
          {backend ? 'Save' : 'Add backend'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  )
}

function HaproxyServersSection({ backend }: { backend: HAProxyBackend }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [port, setPort] = useState('')
  const [backup, setBackup] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = backend.servers.some((s) => s.name === trimmedName)
  const valid = trimmedName !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addHAProxyServerOps(backend.name, trimmedName, {
      address,
      port,
      backup,
      checkPort: '',
      sendProxy: false,
      sendProxyV2: false,
    })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setName('')
    setAddress('')
    setPort('')
    setBackup(false)
    setShowAdd(false)
  }

  function queueRemove(serverName: string) {
    const op = removeHAProxyServerOp(backend.name, serverName)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Servers</p>
      {backend.servers.map((server) => (
        <div key={server.name} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {server.name} {server.address}
            {server.port !== undefined && `:${server.port}`}
            {server.backup && ' (backup)'}
          </span>
          <button onClick={() => queueRemove(server.name)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {backend.servers.length === 0 && <p className="text-xs text-slate-500">No servers configured yet.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add server'}
      </button>
      {showAdd && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            {...noExtensionInputProps}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="app1"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="10.0.0.5"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="8080"
            className={inputClass}
          />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} className="accent-accent-500" />
            Backup server
          </label>
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="text-xs text-danger-500">This server name is already used.</p>}
        </div>
      )}
    </div>
  )
}

function HaproxyBackendRulesSection({ backend }: { backend: HAProxyBackend }) {
  const [showAdd, setShowAdd] = useState(false)
  const [domainNames, setDomainNames] = useState('')
  const [setServer, setSetServer] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const nextId = String(backend.rules.reduce((max, r) => Math.max(max, Number(r.id)), 0) + 1)

  function submit() {
    const ops = addHAProxyBackendRuleOps(backend.name, nextId, {
      domainNames,
      wildcardDomain: false,
      ssl: '',
      urlPathBegin: '',
      urlPathEnd: '',
      urlPathExact: '',
      setRedirectLocation: '',
      setBackend: '',
      setServer,
    })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setDomainNames('')
    setSetServer('')
    setShowAdd(false)
  }

  function queueRemove(ruleId: string) {
    const op = removeHAProxyBackendRuleOp(backend.name, ruleId)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Routing rules</p>
      {backend.rules.map((rule) => (
        <div key={rule.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            #{rule.id} {rule.domainNames.join(',')}
            {rule.setServer && ` -> ${rule.setServer}`}
          </span>
          <button onClick={() => queueRemove(rule.id)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {backend.rules.length === 0 && <p className="text-xs text-slate-500">No routing rules configured.</p>}
      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add rule'}
      </button>
      {showAdd && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            {...noExtensionInputProps}
            value={domainNames}
            onChange={(e) => setDomainNames(e.target.value)}
            placeholder="example.com"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={setServer}
            onChange={(e) => setSetServer(e.target.value)}
            placeholder="route to server name"
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
