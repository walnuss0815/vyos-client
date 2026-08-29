import { useState } from 'react'
import ChipList from '../ChipList'
import { accelPppBasePath } from '../../lib/vpnAccelPppParse'
import { accelPppConfigToSettingsFormValues, accelPppSettingsFormToOps, type AccelPppSettingsFormValues } from '../../lib/vpnAccelPppForm'
import { ACCEL_PPP_IP_OPTIONS, ACCEL_PPP_LOG_LEVELS, ACCEL_PPP_MPPE_OPTIONS, type AccelPppConfig, type AccelPppKind } from '../../lib/vpnAccelPppTypes'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** AccelPppServer.tsx's "Settings" section - one of that component's
 * several sections, extracted into its own file for size (see
 * AccelPppServer.tsx's own doc comment for why it's split this way). */
export default function AccelPppSettingsSection({ kind, config }: { kind: AccelPppKind; config: AccelPppConfig }) {
  const [values, setValues] = useState<AccelPppSettingsFormValues>(() => accelPppConfigToSettingsFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof AccelPppSettingsFormValues>(key: K, value: AccelPppSettingsFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = accelPppSettingsFormToOps(kind, config, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Settings</h2>
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            Description
            <input {...noExtensionInputProps} value={values.description} onChange={(e) => update('description', e.target.value)} className={inputClass} />
          </label>
          {kind !== 'sstp' && (
            <label className={labelClass}>
              Outside address
              <input {...noExtensionInputProps} value={values.outsideAddress} onChange={(e) => update('outsideAddress', e.target.value)} placeholder="203.0.113.1" className={inputClass} />
            </label>
          )}
          <label className={labelClass}>
            Gateway address
            <input {...noExtensionInputProps} value={values.gatewayAddress} onChange={(e) => update('gatewayAddress', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Default IPv4 pool
            <input {...noExtensionInputProps} value={values.defaultPool} onChange={(e) => update('defaultPool', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Default IPv6 pool
            <input {...noExtensionInputProps} value={values.defaultIpv6Pool} onChange={(e) => update('defaultIpv6Pool', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            MTU
            <input {...noExtensionInputProps} value={values.mtu} onChange={(e) => update('mtu', e.target.value)} placeholder={kind === 'sstp' ? '1500' : '1436'} className={inputClass} />
          </label>
          <label className={labelClass}>
            Max concurrent sessions
            <input {...noExtensionInputProps} value={values.maxConcurrentSessions} onChange={(e) => update('maxConcurrentSessions', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Thread count
            <input {...noExtensionInputProps} value={values.threadCount} onChange={(e) => update('threadCount', e.target.value)} placeholder="all" className={inputClass} />
          </label>
          <label className={labelClass}>
            Log level
            <select value={values.logLevel} onChange={(e) => update('logLevel', e.target.value)} className={inputClass}>
              <option value="">Default (3)</option>
              {ACCEL_PPP_LOG_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Shaper fwmark
            <input {...noExtensionInputProps} value={values.shaperFwmark} onChange={(e) => update('shaperFwmark', e.target.value)} className={inputClass} />
          </label>
          {kind === 'sstp' && (
            <>
              <label className={labelClass}>
                Port
                <input {...noExtensionInputProps} value={values.port} onChange={(e) => update('port', e.target.value)} placeholder="443" className={inputClass} />
              </label>
              <label className={labelClass}>
                TLS SNI host name
                <input {...noExtensionInputProps} value={values.sstpHostName} onChange={(e) => update('sstpHostName', e.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                CA certificate (PKI name)
                <input {...noExtensionInputProps} value={values.caCertificate} onChange={(e) => update('caCertificate', e.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Certificate (PKI name)
                <input {...noExtensionInputProps} value={values.certificate} onChange={(e) => update('certificate', e.target.value)} className={inputClass} />
              </label>
            </>
          )}
          {kind === 'l2tp' && (
            <>
              <label className={labelClass}>
                LNS host name (sent to client)
                <input {...noExtensionInputProps} value={values.lnsHostName} onChange={(e) => update('lnsHostName', e.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                LNS shared secret {config.lns.hasSharedSecret ? '(leave blank to keep)' : ''}
                <input {...noExtensionInputProps} type="password" value={values.hasLnsSharedSecret} onChange={(e) => update('hasLnsSharedSecret', e.target.value)} className={inputClass} />
              </label>
              <FieldLabel
                label="IPsec transport auth mode"
                hint="L2TP itself has no encryption - VyOS wraps it in an IPsec transport-mode tunnel for that, authenticated here by a shared secret or an x509 certificate."
              >
                <select value={values.ipsecAuthMode} onChange={(e) => update('ipsecAuthMode', e.target.value)} className={inputClass}>
                  <option value="">Select…</option>
                  <option value="pre-shared-secret">pre-shared-secret</option>
                  <option value="x509">x509</option>
                </select>
              </FieldLabel>
              {values.ipsecAuthMode === 'pre-shared-secret' && (
                <label className={labelClass}>
                  IPsec pre-shared secret {config.ipsecSettings.hasPresharedSecret ? '(leave blank to keep)' : ''}
                  <input {...noExtensionInputProps} type="password" value={values.hasIpsecPresharedSecret} onChange={(e) => update('hasIpsecPresharedSecret', e.target.value)} className={inputClass} />
                </label>
              )}
              <label className={labelClass}>
                IKE lifetime (s)
                <input {...noExtensionInputProps} value={values.ikeLifetime} onChange={(e) => update('ikeLifetime', e.target.value)} placeholder="3600" className={inputClass} />
              </label>
              <label className={labelClass}>
                ESP lifetime (s)
                <input {...noExtensionInputProps} value={values.espLifetime} onChange={(e) => update('espLifetime', e.target.value)} placeholder="3600" className={inputClass} />
              </label>
            </>
          )}
        </div>

        <div className="mt-4 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs text-slate-500">PPP options</p>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              Min MTU
              <input {...noExtensionInputProps} value={values.minMtu} onChange={(e) => update('minMtu', e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              MRU
              <input {...noExtensionInputProps} value={values.mru} onChange={(e) => update('mru', e.target.value)} className={inputClass} />
            </label>
            <FieldLabel
              label="MPPE"
              hint="Microsoft Point-to-Point Encryption: whether to require, prefer, or refuse encrypting the PPP session itself (separate from any outer IPsec/TLS layer)."
            >
              <select value={values.mppe} onChange={(e) => update('mppe', e.target.value)} className={inputClass}>
                <option value="">Default (prefer)</option>
                {ACCEL_PPP_MPPE_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </FieldLabel>
            <label className={labelClass}>
              LCP echo interval (s)
              <input {...noExtensionInputProps} value={values.lcpEchoInterval} onChange={(e) => update('lcpEchoInterval', e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              LCP echo failure count
              <input {...noExtensionInputProps} value={values.lcpEchoFailure} onChange={(e) => update('lcpEchoFailure', e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              LCP echo timeout (s)
              <input {...noExtensionInputProps} value={values.lcpEchoTimeout} onChange={(e) => update('lcpEchoTimeout', e.target.value)} className={inputClass} />
            </label>
            <FieldLabel
              label="IPv4 (IPCP) negotiation"
              hint="deny never negotiates IPv4; allow only if the client asks; prefer asks first but won't fail if refused; require fails the session without it."
            >
              <select value={values.ipv4} onChange={(e) => update('ipv4', e.target.value)} className={inputClass}>
                <option value="">Default</option>
                {ACCEL_PPP_IP_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="IPv6 (IPCP) negotiation" hint="Same deny/allow/prefer/require choices as IPv4 above, for IPv6 Control Protocol negotiation.">
              <select value={values.ipv6} onChange={(e) => update('ipv6', e.target.value)} className={inputClass}>
                <option value="">Default (deny)</option>
                {ACCEL_PPP_IP_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </FieldLabel>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.disableCcp} onChange={(e) => update('disableCcp', e.target.checked)} className="accent-accent-500" />
            Disable Compression Control Protocol (CCP)
            <InfoTooltip text="CCP negotiates PPP-level payload compression. Some clients handle it poorly; disabling it can fix connection issues at the cost of no PPP-level compression." />
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.snmpMasterAgent} onChange={(e) => update('snmpMasterAgent', e.target.checked)} className="accent-accent-500" />
            Enable SNMP master agent mode
          </label>
        </div>

        <div className="mt-4 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs text-slate-500">Limits (per-source connection rate)</p>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              Connection limit
              <input {...noExtensionInputProps} value={values.connectionLimit} onChange={(e) => update('connectionLimit', e.target.value)} placeholder="1/min" className={inputClass} />
            </label>
            <label className={labelClass}>
              Burst
              <input {...noExtensionInputProps} value={values.burst} onChange={(e) => update('burst', e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Timeout (s)
              <input {...noExtensionInputProps} value={values.limitsTimeout} onChange={(e) => update('limitsTimeout', e.target.value)} className={inputClass} />
            </label>
          </div>
        </div>

        <div className="mt-4 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs text-slate-500">Extended scripts</p>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              on-pre-up
              <input {...noExtensionInputProps} value={values.onPreUp} onChange={(e) => update('onPreUp', e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              on-up
              <input {...noExtensionInputProps} value={values.onUp} onChange={(e) => update('onUp', e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              on-down
              <input {...noExtensionInputProps} value={values.onDown} onChange={(e) => update('onDown', e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              on-change
              <input {...noExtensionInputProps} value={values.onChange} onChange={(e) => update('onChange', e.target.value)} className={inputClass} />
            </label>
          </div>
        </div>

        <div className="mt-4 border-t border-surface-border pt-3">
          <p className="mb-1 text-xs text-slate-500">Name servers</p>
          <ChipList
            values={config.nameServers}
            basePath={accelPppBasePath(kind)}
            leaf="name-server"
            pathLabel={`vpn ${kind} ${kind === 'sstp' ? '' : 'remote-access '}name-server`}
            placeholder="192.0.2.1 or IPv6"
          />
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">WINS servers</p>
          <ChipList
            values={config.winsServers}
            basePath={accelPppBasePath(kind)}
            leaf="wins-server"
            pathLabel={`vpn ${kind} ${kind === 'sstp' ? '' : 'remote-access '}wins-server`}
            placeholder="192.0.2.1"
          />
        </div>

        <button onClick={save} className={`mt-4 bg-accent-600 ${buttonClass}`}>Save settings</button>
      </div>
    </div>
  )
}
