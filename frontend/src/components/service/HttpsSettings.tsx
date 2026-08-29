import { useState } from 'react'
import ChipList from '../ChipList'
import { httpsAllowClientPath, httpsGraphqlCorsPath, httpsPath } from '../../lib/serviceHttpsParse'
import {
  addHTTPSAPIKeyOp,
  blankHTTPSFormValues,
  disableHTTPSOp,
  enableHTTPSOp,
  httpsConfigToFormValues,
  httpsFormToOps,
  removeHTTPSAPIKeyOp,
} from '../../lib/serviceHttpsForm'
import { HTTPS_GRAPHQL_AUTH_TYPES, HTTPS_TLS_VERSIONS, type HTTPSConfig } from '../../lib/serviceHttpsTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function HttpsSettings({ config }: { config: HTTPSConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">
          The HTTPS API is not configured under this path. If vyos-client is already reaching this
          router, VyOS's REST API is enabled some other way (its own defaults, or a config this
          app can't fully parse yet) - enabling here writes a fresh <code>service https</code> node.
        </p>
        <button
          onClick={() => {
            const op = enableHTTPSOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable (defaults: port 443, TLS 1.2 &amp; 1.3)
        </button>
      </div>
    )
  }

  return <HttpsSettingsForm config={config} />
}

function HttpsSettingsForm({ config }: { config: HTTPSConfig }) {
  const [values, setValues] = useState(() => httpsConfigToFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankHTTPSFormValues>>(
    key: K,
    value: ReturnType<typeof blankHTTPSFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function toggleTlsVersion(version: string) {
    setValues((v) => ({
      ...v,
      tlsVersions: v.tlsVersions.includes(version)
        ? v.tlsVersions.filter((x) => x !== version)
        : [...v.tlsVersions, version],
    }))
  }

  function save() {
    const ops = httpsFormToOps(config, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
  }

  function queueDisable() {
    const op = disableHTTPSOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-danger-500">
        This is the HTTPS API vyos-client's own backend uses to reach this router. Changing the
        port, VRF, or certificates - or disabling the service entirely - can lock this app out.
        Commit-confirm ("Safe apply") is essential here: if the new settings break connectivity,
        VyOS automatically reverts before the confirm timer expires.
      </p>

      <ApiKeysSection config={config} />

      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
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
            Request body size limit (MB)
            <input
              {...noExtensionInputProps}
              value={values.requestBodySizeLimit}
              onChange={(e) => update('requestBodySizeLimit', e.target.value)}
              placeholder="1"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            VRF
            <input
              {...noExtensionInputProps}
              value={values.vrf}
              onChange={(e) => update('vrf', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            CA certificate (PKI name)
            <input
              {...noExtensionInputProps}
              value={values.caCertificate}
              onChange={(e) => update('caCertificate', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Certificate (PKI name)
            <input
              {...noExtensionInputProps}
              value={values.certificate}
              onChange={(e) => update('certificate', e.target.value)}
              className={inputClass}
            />
          </label>
          <FieldLabel
            label="DH parameters (PKI name)"
            hint="References a Diffie-Hellman parameter set from the PKI tab, used to strengthen key exchange for older TLS cipher suites - optional, and irrelevant if only modern TLS 1.3 clients connect."
          >
            <input
              {...noExtensionInputProps}
              value={values.dhParams}
              onChange={(e) => update('dhParams', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.enableHttpRedirect}
            onChange={(e) => update('enableHttpRedirect', e.target.checked)}
            className="accent-accent-500"
          />
          Redirect HTTP to HTTPS
          <InfoTooltip text="Makes plain HTTP requests to this router automatically bounce to the HTTPS equivalent, instead of connection refused/no response." />
        </label>

        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">TLS versions</p>
          <div className="flex gap-4">
            {HTTPS_TLS_VERSIONS.map((version) => (
              <label key={version} className="flex items-center gap-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={values.tlsVersions.includes(version)}
                  onChange={() => toggleTlsVersion(version)}
                  className="accent-accent-500"
                />
                TLS {version}
              </label>
            ))}
          </div>
        </div>

        <h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">GraphQL API</h3>
        <div className="grid grid-cols-3 gap-3">
          <FieldLabel
            label="Auth type"
            hint="How GraphQL requests prove their identity - key reuses one of the API keys configured above; token issues a short-lived signed credential instead, expiring per the setting to the right."
          >
            <select
              value={values.graphqlAuthType}
              onChange={(e) => update('graphqlAuthType', e.target.value)}
              className={inputClass}
            >
              <option value="">Default (key)</option>
              {HTTPS_GRAPHQL_AUTH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </FieldLabel>
          <label className={labelClass}>
            Token expiration (s)
            <input
              {...noExtensionInputProps}
              value={values.graphqlExpiration}
              onChange={(e) => update('graphqlExpiration', e.target.value)}
              placeholder="3600"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Secret length (bytes)
            <input
              {...noExtensionInputProps}
              value={values.graphqlSecretLength}
              onChange={(e) => update('graphqlSecretLength', e.target.value)}
              placeholder="32"
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.graphqlIntrospection}
              onChange={(e) => update('graphqlIntrospection', e.target.checked)}
              className="accent-accent-500"
            />
            Enable schema introspection
            <InfoTooltip text="Lets GraphQL clients (like API explorer tools) query the schema itself to discover available queries/mutations - convenient for development, but reveals API structure to anyone who can authenticate." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.restStrict}
              onChange={(e) => update('restStrict', e.target.checked)}
              className="accent-accent-500"
            />
            REST API: strict path checking
            <InfoTooltip text="Rejects REST API requests for config-tree paths that don't exist in VyOS's schema, instead of silently returning an empty/null result." />
          </label>
        </div>

        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save settings
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Listen addresses</p>
          <ChipList
            values={config.listenAddresses}
            basePath={httpsPath()}
            leaf="listen-address"
            pathLabel="service https listen-address"
            placeholder="192.0.2.1"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Allowed clients</p>
          <ChipList
            values={config.allowClientAddresses}
            basePath={httpsAllowClientPath()}
            leaf="address"
            pathLabel="service https allow-client address"
            placeholder="192.0.2.0/24"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            GraphQL CORS allowed origins
          </p>
          <ChipList
            values={config.graphqlCorsAllowOrigins}
            basePath={httpsGraphqlCorsPath()}
            leaf="allow-origin"
            pathLabel="service https api graphql cors allow-origin"
            placeholder="https://example.com"
          />
        </div>
      </div>

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable HTTPS API entirely
        </button>
      </div>
    </div>
  )
}

function ApiKeysSection({ config }: { config: HTTPSConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [key, setKey] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = config.apiKeys.some((k) => k.id === trimmedId)
  const valid = trimmedId !== '' && !taken && key.trim() !== ''

  function submit() {
    if (!valid) return
    const op = addHTTPSAPIKeyOp(trimmedId, key.trim())
    add({ op, label: `set ${op.path.join(' ')}` })
    setId('')
    setKey('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
          API keys ({config.apiKeys.length})
          <InfoTooltip text="Grants programmatic REST/GraphQL access without a user login session - anyone holding the key value has full API access, so treat it like a password and rotate it if it may have leaked." />
        </h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add key'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 space-y-2 rounded-xl border border-surface-border bg-surface-900 p-4">
          <input
            {...noExtensionInputProps}
            autoFocus
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="key id/name"
            className={`w-full ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="plaintext key value"
            className={`w-full ${inputClass}`}
          />
          {taken && <p className="text-xs text-danger-500">This key id is already used.</p>}
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add key
          </button>
        </div>
      )}

      <div className="space-y-1">
        {config.apiKeys.map((apiKey) => (
          <div
            key={apiKey.id}
            className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-900 p-3"
          >
            <span className="font-mono text-sm text-white">
              {apiKey.id}
              {apiKey.hasKey && <span className="ml-2 text-xs text-slate-500">key set</span>}
            </span>
            <button
              onClick={() => {
                const op = removeHTTPSAPIKeyOp(apiKey.id)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {config.apiKeys.length === 0 && <p className="text-xs text-slate-500">No API keys configured yet.</p>}
      </div>
    </div>
  )
}
