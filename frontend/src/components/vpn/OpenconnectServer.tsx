import { useState } from 'react'
import ChipList from '../ChipList'
import { openconnectNetworkSettingsPath } from '../../lib/vpnOpenconnectParse'
import {
  addOpenconnectAccountingRadiusServerOps,
  addOpenconnectAuthRadiusServerOps,
  addOpenconnectLocalUserOps,
  disableOpenconnectOp,
  enableOpenconnectOp,
  openconnectConfigToSettingsFormValues,
  openconnectSettingsFormToOps,
  removeOpenconnectAccountingRadiusServerOp,
  removeOpenconnectAuthRadiusServerOp,
  removeOpenconnectLocalUserOp,
  toggleOpenconnectAccountingRadiusModeOp,
  toggleOpenconnectLocalUserDisabledOp,
  type OpenconnectSettingsFormValues,
} from '../../lib/vpnOpenconnectForm'
import {
  OPENCONNECT_LOCAL_AUTH_MODES,
  OPENCONNECT_OTP_TOKEN_TYPES,
  OPENCONNECT_TLS_VERSIONS,
  type OpenconnectConfig,
} from '../../lib/vpnOpenconnectTypes'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

export default function OpenconnectServer({ config }: { config: OpenconnectConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">OpenConnect is not configured.</p>
        <button
          onClick={() => {
            const op = enableOpenconnectOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable OpenConnect
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SettingsSection config={config} />
      <AuthenticationSection config={config} />
      <AccountingSection config={config} />
      <div>
        <button
          onClick={() => {
            const op = disableOpenconnectOp()
            add({ op, label: `delete ${op.path.join(' ')}` })
          }}
          className="text-xs text-danger-500 hover:text-danger-400"
        >
          Disable OpenConnect entirely
        </button>
      </div>
    </div>
  )
}

function SettingsSection({ config }: { config: OpenconnectConfig }) {
  const [values, setValues] = useState<OpenconnectSettingsFormValues>(() => openconnectConfigToSettingsFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof OpenconnectSettingsFormValues>(key: K, value: OpenconnectSettingsFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = openconnectSettingsFormToOps(config, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Settings</h2>
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            Listen address
            <input {...noExtensionInputProps} value={values.listenAddress} onChange={(e) => update('listenAddress', e.target.value)} placeholder="0.0.0.0" className={inputClass} />
          </label>
          <label className={labelClass}>
            Listen port (TCP)
            <input {...noExtensionInputProps} value={values.listenPortTcp} onChange={(e) => update('listenPortTcp', e.target.value)} placeholder="443" className={inputClass} />
          </label>
          <label className={labelClass}>
            Listen port (UDP)
            <input {...noExtensionInputProps} value={values.listenPortUdp} onChange={(e) => update('listenPortUdp', e.target.value)} placeholder="443" className={inputClass} />
          </label>
          <label className={labelClass}>
            TLS minimum version
            <select value={values.tlsVersionMin} onChange={(e) => update('tlsVersionMin', e.target.value)} className={inputClass}>
              <option value="">Default (1.2)</option>
              {OPENCONNECT_TLS_VERSIONS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Certificate (PKI name)
            <input {...noExtensionInputProps} value={values.certificate} onChange={(e) => update('certificate', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Private key passphrase {config.ssl.hasPassphrase ? '(leave blank to keep)' : ''}
            <input {...noExtensionInputProps} type="password" value={values.hasPassphrase} onChange={(e) => update('hasPassphrase', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Client IPv4 subnet
            <input {...noExtensionInputProps} value={values.clientIpv4Subnet} onChange={(e) => update('clientIpv4Subnet', e.target.value)} placeholder="192.0.2.0/24" className={inputClass} />
          </label>
          <label className={labelClass}>
            Client IPv6 pool prefix
            <input {...noExtensionInputProps} value={values.clientIpv6PoolPrefix} onChange={(e) => update('clientIpv6PoolPrefix', e.target.value)} placeholder="2001:db8::/64" className={inputClass} />
          </label>
          <label className={labelClass}>
            Client IPv6 pool mask
            <input {...noExtensionInputProps} value={values.clientIpv6PoolMask} onChange={(e) => update('clientIpv6PoolMask', e.target.value)} placeholder="64" className={inputClass} />
          </label>
          <FieldLabel
            label="Tunnel all DNS"
            hint="When yes, routes every DNS query through the VPN instead of only for the split-DNS domains configured below - the default when a full-tunnel default route is pushed."
          >
            <select value={values.tunnelAllDns} onChange={(e) => update('tunnelAllDns', e.target.value)} className={inputClass}>
              <option value="">Default (no)</option>
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </FieldLabel>
          <label className={labelClass}>
            Connect script
            <input {...noExtensionInputProps} value={values.scriptConnect} onChange={(e) => update('scriptConnect', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Disconnect script
            <input {...noExtensionInputProps} value={values.scriptDisconnect} onChange={(e) => update('scriptDisconnect', e.target.value)} className={inputClass} />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={values.httpSecurityHeaders} onChange={(e) => update('httpSecurityHeaders', e.target.checked)} className="accent-accent-500" />
          Enable HTTP security headers
        </label>

        <div className="mt-4 border-t border-surface-border pt-3">
          <p className="mb-1 text-xs text-slate-500">Pushed routes</p>
          <ChipList values={config.networkSettings.pushRoutes} basePath={openconnectNetworkSettingsPath()} leaf="push-route" pathLabel="vpn openconnect network-settings push-route" placeholder="10.0.0.0/8" />
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">Name servers</p>
          <ChipList values={config.networkSettings.nameServers} basePath={openconnectNetworkSettingsPath()} leaf="name-server" pathLabel="vpn openconnect network-settings name-server" placeholder="192.0.2.1 or IPv6" />
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">Split-DNS domains</p>
          <ChipList values={config.networkSettings.splitDns} basePath={openconnectNetworkSettingsPath()} leaf="split-dns" pathLabel="vpn openconnect network-settings split-dns" placeholder="example.com" />
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">CA certificates (PKI names)</p>
          <ChipList values={config.ssl.caCertificates} basePath={['vpn', 'openconnect', 'ssl']} leaf="ca-certificate" pathLabel="vpn openconnect ssl ca-certificate" placeholder="my-ca" />
        </div>

        <button onClick={save} className={`mt-4 bg-accent-600 ${buttonClass}`}>Save settings</button>
      </div>
    </div>
  )
}

function AuthenticationSection({ config }: { config: OpenconnectConfig }) {
  const [values, setValues] = useState<OpenconnectSettingsFormValues>(() => openconnectConfigToSettingsFormValues(config))
  const add = usePendingChangesStore((s) => s.add)
  const { authentication } = config

  function update<K extends keyof OpenconnectSettingsFormValues>(key: K, value: OpenconnectSettingsFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = openconnectSettingsFormToOps(config, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Authentication</h2>
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
          <FieldLabel
            label="Local auth mode"
            hint="password checks only the password below; otp checks only the one-time code; password-otp requires the password first, then the OTP code."
          >
            <select value={values.localAuthMode} onChange={(e) => update('localAuthMode', e.target.value)} className={inputClass}>
              <option value="">Not used</option>
              {OPENCONNECT_LOCAL_AUTH_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel
            label="Certificate user identifier field"
            hint="Which field of a client certificate identifies the user - Common Name (cn) is the usual choice."
          >
            <input {...noExtensionInputProps} value={values.certificateUserIdentifierField} onChange={(e) => update('certificateUserIdentifierField', e.target.value)} placeholder="cn" className={inputClass} />
          </FieldLabel>
          <label className={labelClass}>
            RADIUS timeout (s)
            <input {...noExtensionInputProps} value={values.radiusTimeout} onChange={(e) => update('radiusTimeout', e.target.value)} placeholder="3" className={inputClass} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.radiusAuthEnabled} onChange={(e) => update('radiusAuthEnabled', e.target.checked)} className="accent-accent-500" />
            Use RADIUS for authentication
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.radiusGroupconfig} onChange={(e) => update('radiusGroupconfig', e.target.checked)} className="accent-accent-500" />
            RADIUS overrides per-user config (groupconfig)
            <InfoTooltip text="When enabled, all per-session settings (routes, DNS, etc.) come from RADIUS attributes instead of any local per-user config files." />
          </label>
        </div>
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-500">Selectable client groups</p>
          <ChipList values={authentication.groups} basePath={['vpn', 'openconnect', 'authentication']} leaf="group" pathLabel="vpn openconnect authentication group" placeholder="sales[Sales Team]" />
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>Save settings</button>

        <LocalUsersSubsection config={config} />
        <AuthRadiusServersSubsection config={config} />
      </div>
    </div>
  )
}

function LocalUsersSubsection({ config }: { config: OpenconnectConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otpKey, setOtpKey] = useState('')
  const [otpLength, setOtpLength] = useState('')
  const [otpInterval, setOtpInterval] = useState('')
  const [otpTokenType, setOtpTokenType] = useState('')
  const add = usePendingChangesStore((s) => s.add)
  const { localUsers } = config.authentication

  const trimmed = username.trim()
  const taken = localUsers.some((u) => u.username === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addOpenconnectLocalUserOps(trimmed, { password, otpKey, otpLength, otpInterval, otpTokenType })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setUsername('')
    setPassword('')
    setOtpKey('')
    setOtpLength('')
    setOtpInterval('')
    setOtpTokenType('')
    setShowAdd(false)
  }

  return (
    <div className="mt-4 border-t border-surface-border pt-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-slate-500">Local users ({localUsers.length})</p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add user'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className={inputClass} />
          <input {...noExtensionInputProps} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" className={inputClass} />
          <input {...noExtensionInputProps} type="password" value={otpKey} onChange={(e) => setOtpKey(e.target.value)} placeholder="OTP key (hex, optional)" className={inputClass} />
          <input {...noExtensionInputProps} value={otpLength} onChange={(e) => setOtpLength(e.target.value)} placeholder="OTP digits (6-8)" className={inputClass} />
          <input {...noExtensionInputProps} value={otpInterval} onChange={(e) => setOtpInterval(e.target.value)} placeholder="OTP interval (s)" className={inputClass} />
          <select value={otpTokenType} onChange={(e) => setOtpTokenType(e.target.value)} className={inputClass}>
            <option value="">OTP token type</option>
            {OPENCONNECT_OTP_TOKEN_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>Add</button>
          {taken && <p className="col-span-3 text-xs text-danger-500">This username is already used.</p>}
        </div>
      )}
      <div className="space-y-1">
        {localUsers.map((user) => (
          <div key={user.username} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {user.username}
              {user.disabled && <span className="ml-1 text-danger-500">(disabled)</span>}
              {user.hasPassword && <span className="text-slate-500"> · password set</span>}
              {user.otp.hasKey && <span className="text-slate-500"> · OTP key set</span>}
            </span>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => {
                  const op = toggleOpenconnectLocalUserDisabledOp(user.username, !user.disabled)
                  add({ op, label: `${op.op} ${op.path.join(' ')}` })
                }}
                className="text-slate-500 hover:text-accent-400"
              >
                {user.disabled ? 'Enable' : 'Disable'}
              </button>
              <button
                onClick={() => {
                  const op = removeOpenconnectLocalUserOp(user.username)
                  add({ op, label: `delete ${op.path.join(' ')}` })
                }}
                className="text-slate-500 hover:text-danger-500"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {localUsers.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}

function AuthRadiusServersSubsection({ config }: { config: OpenconnectConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [key, setKey] = useState('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)
  const { servers } = config.authentication.radius

  const trimmedAddress = address.trim()
  const taken = servers.some((s) => s.address === trimmedAddress)
  const valid = trimmedAddress !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addOpenconnectAuthRadiusServerOps(trimmedAddress, key, port)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setKey('')
    setPort('')
    setShowAdd(false)
  }

  return (
    <div className="mt-4 border-t border-surface-border pt-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-slate-500">Authentication RADIUS servers ({servers.length})</p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add server'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.0.2.9" className={inputClass} />
          <input {...noExtensionInputProps} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="shared secret" className={inputClass} />
          <input {...noExtensionInputProps} value={port} onChange={(e) => setPort(e.target.value)} placeholder="port (default 1812)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>Add server</button>
          {taken && <p className="col-span-3 text-xs text-danger-500">Already configured.</p>}
        </div>
      )}
      <div className="space-y-1">
        {servers.map((server) => (
          <div key={server.address} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {server.address}
              {server.port && `:${server.port}`}
              {server.hasKey && <span className="text-slate-500"> · key set</span>}
            </span>
            <button
              onClick={() => {
                const op = removeOpenconnectAuthRadiusServerOp(server.address)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {servers.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}

function AccountingSection({ config }: { config: OpenconnectConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [key, setKey] = useState('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)
  const { accounting } = config

  const trimmedAddress = address.trim()
  const taken = accounting.radiusServers.some((s) => s.address === trimmedAddress)
  const valid = trimmedAddress !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addOpenconnectAccountingRadiusServerOps(trimmedAddress, key, port)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setKey('')
    setPort('')
    setShowAdd(false)
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">Accounting</h2>
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={accounting.radiusEnabled}
            onChange={(e) => {
              const op = toggleOpenconnectAccountingRadiusModeOp(e.target.checked)
              add({ op, label: `${op.op} ${op.path.join(' ')}` })
            }}
            className="accent-accent-500"
          />
          Use RADIUS for accounting
        </label>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs text-slate-500">RADIUS servers ({accounting.radiusServers.length})</p>
            <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
              {showAdd ? 'Cancel' : '+ Add server'}
            </button>
          </div>
          {showAdd && (
            <div className="mb-2 grid grid-cols-3 gap-2">
              <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.0.2.9" className={inputClass} />
              <input {...noExtensionInputProps} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="shared secret" className={inputClass} />
              <input {...noExtensionInputProps} value={port} onChange={(e) => setPort(e.target.value)} placeholder="acct port (default 1813)" className={inputClass} />
              <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>Add server</button>
              {taken && <p className="col-span-3 text-xs text-danger-500">Already configured.</p>}
            </div>
          )}
          <div className="space-y-1">
            {accounting.radiusServers.map((server) => (
              <div key={server.address} className="flex items-center justify-between rounded border border-surface-border p-2">
                <span className="font-mono text-xs text-slate-300">
                  {server.address}
                  {server.port && `:${server.port}`}
                  {server.hasKey && <span className="text-slate-500"> · key set</span>}
                </span>
                <button
                  onClick={() => {
                    const op = removeOpenconnectAccountingRadiusServerOp(server.address)
                    add({ op, label: `delete ${op.path.join(' ')}` })
                  }}
                  className="text-xs text-slate-500 hover:text-danger-500"
                >
                  Remove
                </button>
              </div>
            ))}
            {accounting.radiusServers.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
