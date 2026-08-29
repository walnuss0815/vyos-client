import { useState } from 'react'
import {
  haproxyGlobalParametersFormToOps,
  haproxyGlobalParametersToFormValues,
  haproxyGlobalTimeoutFormToOps,
  haproxyGlobalTimeoutToFormValues,
  setHAProxyVrfOp,
  type HAProxyGlobalParametersFormValues,
  type HAProxyGlobalTimeoutFormValues,
} from '../../lib/loadBalancingHaproxyForm'
import { haproxyPath } from '../../lib/loadBalancingParse'
import {
  HAPROXY_LOG_FACILITIES,
  HAPROXY_LOG_LEVELS,
  HAPROXY_SSL_CIPHERS,
  HAPROXY_TLS_VERSIONS,
  type HAProxyGlobalParameters,
  type HAProxyGlobalTimeout,
} from '../../lib/loadBalancingTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import ChipList from '../ChipList'
import FieldLabel from '../FieldLabel'

/** `global-parameters`, `timeout` (the always-applied global defaults
 * - distinct from each service/backend's own optional per-item
 * overrides, see loadBalancingTypes.ts's doc comments on those), and
 * `vrf` - all queued immediately on Save, rather than per-field on
 * blur, since these are edited together as one small settings form. */
export default function HaproxyGlobalSettings({
  globalParameters,
  globalTimeout,
  vrf,
}: {
  globalParameters: HAProxyGlobalParameters
  globalTimeout: HAProxyGlobalTimeout
  vrf?: string
}) {
  const add = usePendingChangesStore((s) => s.add)
  const beforeParams = haproxyGlobalParametersToFormValues(globalParameters)
  const beforeTimeout = haproxyGlobalTimeoutToFormValues(globalTimeout)

  const [params, setParams] = useState<HAProxyGlobalParametersFormValues>(beforeParams)
  const [timeout, setTimeoutValues] = useState<HAProxyGlobalTimeoutFormValues>(beforeTimeout)
  const [vrfValue, setVrfValue] = useState(vrf ?? '')

  function updateParams<K extends keyof HAProxyGlobalParametersFormValues>(
    key: K,
    value: HAProxyGlobalParametersFormValues[K],
  ) {
    setParams((v) => ({ ...v, [key]: value }))
  }

  function updateTimeout<K extends keyof HAProxyGlobalTimeoutFormValues>(
    key: K,
    value: HAProxyGlobalTimeoutFormValues[K],
  ) {
    setTimeoutValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = [
      ...haproxyGlobalParametersFormToOps(beforeParams, params),
      ...haproxyGlobalTimeoutFormToOps(beforeTimeout, timeout),
    ]
    const trimmedVrf = vrfValue.trim()
    if (trimmedVrf !== (vrf ?? '')) ops.push(setHAProxyVrfOp(vrfValue))
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="mb-8 rounded-xl border border-surface-border bg-surface-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Global settings</p>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Max connections (optional)
          <input
            {...noExtensionInputProps}
            value={params.maxConnections}
            onChange={(e) => updateParams('maxConnections', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Minimum TLS version
          <select
            value={params.tlsVersionMin}
            onChange={(e) => updateParams('tlsVersionMin', e.target.value)}
            className={inputClass}
          >
            {HAPROXY_TLS_VERSIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          VRF (optional)
          <input
            {...noExtensionInputProps}
            value={vrfValue}
            onChange={(e) => setVrfValue(e.target.value)}
            className={`font-mono ${inputClass}`}
          />
        </label>
        <FieldLabel label="Log facility (optional)">
          <select
            value={params.loggingFacility}
            onChange={(e) => updateParams('loggingFacility', e.target.value)}
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
          <select
            value={params.loggingLevel}
            onChange={(e) => updateParams('loggingLevel', e.target.value)}
            className={inputClass}
          >
            {HAPROXY_LOG_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-3">
        <FieldLabel label="SSL bind ciphers" hint="Defaults to all 8 listed ciphers if none are explicitly selected here.">
          <ChipList
            values={globalParameters.sslBindCiphers}
            basePath={haproxyPath('global-parameters')}
            leaf="ssl-bind-ciphers"
            pathLabel="... global-parameters ssl-bind-ciphers"
            placeholder="cipher name"
          />
        </FieldLabel>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-600">
          {HAPROXY_SSL_CIPHERS.map((c) => (
            <span key={c} className="rounded bg-surface-800 px-1 py-0.5">
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Default timeouts (seconds) - applied whenever a service/backend doesn't override it
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <label className={labelClass}>
            Check
            <input
              {...noExtensionInputProps}
              value={timeout.check}
              onChange={(e) => updateTimeout('check', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Connect
            <input
              {...noExtensionInputProps}
              value={timeout.connect}
              onChange={(e) => updateTimeout('connect', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Client
            <input
              {...noExtensionInputProps}
              value={timeout.client}
              onChange={(e) => updateTimeout('client', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Server
            <input
              {...noExtensionInputProps}
              value={timeout.server}
              onChange={(e) => updateTimeout('server', e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Tunnel
            <input
              {...noExtensionInputProps}
              value={timeout.tunnel}
              onChange={(e) => updateTimeout('tunnel', e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
        Save global settings
      </button>
    </div>
  )
}
