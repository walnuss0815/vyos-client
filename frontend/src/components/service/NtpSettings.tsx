import { useState } from 'react'
import ChipList from '../ChipList'
import { ntpAllowClientPath, ntpPath } from '../../lib/serviceNtpParse'
import {
  addNTPServerOps,
  blankNTPGeneralFormValues,
  blankNTPServerFlags,
  ntpConfigToGeneralFormValues,
  ntpGeneralFormToOps,
  removeNTPServerOp,
  type NTPServerFlags,
} from '../../lib/serviceNtpForm'
import { NTP_LEAP_SECOND_MODES, type NTPConfig } from '../../lib/serviceNtpTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

const SERVER_FLAG_LABELS: { key: keyof NTPServerFlags; label: string; hint: string }[] = [
  { key: 'prefer', label: 'Prefer', hint: "Favors this server's replies over others when they disagree, as long as it otherwise looks trustworthy." },
  { key: 'pool', label: 'Pool (associate with multiple servers)', hint: 'Treats the address as a DNS pool name that resolves to several servers, automatically using multiple of them instead of just one host.' },
  { key: 'noselect', label: 'Mark unused', hint: 'Keeps this server in the config and lets it be monitored, but excludes it from ever being chosen as an actual time source.' },
  { key: 'nts', label: 'Network Time Security (NTS)', hint: "Cryptographically authenticates time replies from this server so they can't be spoofed or tampered with in transit - requires the server to support it." },
  { key: 'ptp', label: 'PTP transport', hint: 'Uses hardware-timestamped Precision Time Protocol transport for this source instead of ordinary NTP packets, for sub-microsecond accuracy on supporting hardware.' },
  { key: 'interleave', label: 'Interleaved mode', hint: 'Exchanges timestamps in a follow-up packet rather than the original one, improving accuracy when hardware timestamping is used.' },
]

export default function NtpSettings({ config }: { config: NTPConfig }) {
  return (
    <div className="space-y-6">
      <ServersSection config={config} />
      <GeneralSettings config={config} />
    </div>
  )
}

function ServersSection({ config }: { config: NTPConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [flags, setFlags] = useState<NTPServerFlags>(blankNTPServerFlags())
  const add = usePendingChangesStore((s) => s.add)

  const trimmedAddress = address.trim()
  const taken = config.servers.some((s) => s.address === trimmedAddress)
  const valid = trimmedAddress !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addNTPServerOps(trimmedAddress, flags)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}` })
    }
    setAddress('')
    setFlags(blankNTPServerFlags())
    setShowAdd(false)
  }

  function queueRemove(serverAddress: string) {
    const op = removeNTPServerOp(serverAddress)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          NTP servers ({config.servers.length})
        </h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add server'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-surface-border bg-surface-900 p-4">
          <label className={labelClass}>
            Server address or hostname
            <input
              {...noExtensionInputProps}
              autoFocus
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0.pool.ntp.org"
              className={inputClass}
            />
          </label>
          {taken && <p className="mt-1 text-xs text-danger-500">This server is already configured.</p>}
          <div className="mt-2 flex flex-wrap gap-3">
            {SERVER_FLAG_LABELS.map(({ key, label, hint }) => (
              <label key={key} className="flex items-center gap-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={flags[key]}
                  onChange={(e) => setFlags((f) => ({ ...f, [key]: e.target.checked }))}
                  className="accent-accent-500"
                />
                {label}
                <InfoTooltip text={hint} />
              </label>
            ))}
          </div>
          <button onClick={submit} disabled={!valid} className={`mt-3 bg-accent-600 ${buttonClass}`}>
            Add server
          </button>
        </div>
      )}

      <div className="space-y-2">
        {config.servers.map((server) => (
          <div
            key={server.address}
            className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-900 p-3"
          >
            <div>
              <span className="font-mono text-sm text-white">{server.address}</span>
              <p className="text-xs text-slate-500">
                {SERVER_FLAG_LABELS.filter(({ key }) => server[key])
                  .map(({ label }) => label)
                  .join(', ') || 'no flags set'}
              </p>
            </div>
            <button onClick={() => queueRemove(server.address)} className="text-xs text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </div>
        ))}
        {config.servers.length === 0 && <p className="text-xs text-slate-500">No NTP servers configured yet.</p>}
      </div>
    </div>
  )
}

function GeneralSettings({ config }: { config: NTPConfig }) {
  const [values, setValues] = useState(() => ntpConfigToGeneralFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankNTPGeneralFormValues>>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = ntpGeneralFormToOps(config, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">General settings</h2>
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Bind interface" hint="Restricts the NTP daemon to listening for client requests only on this interface, instead of all interfaces.">
            <input
              {...noExtensionInputProps}
              value={values.interface}
              onChange={(e) => update('interface', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Source interface" hint="Which local interface's address to use when this router reaches out to its own upstream servers - distinct from the listening interface above.">
            <input
              {...noExtensionInputProps}
              value={values.sourceInterface}
              onChange={(e) => update('sourceInterface', e.target.value)}
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
          <FieldLabel
            label="Local reference stratum"
            hint="Lets this router act as a fallback time source of its own (using its local clock) at the given distance-from-reference-clock number, used only if all configured upstream servers become unreachable."
          >
            <input
              {...noExtensionInputProps}
              value={values.localStratum}
              onChange={(e) => update('localStratum', e.target.value)}
              placeholder="1-15"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="Leap second behavior"
            hint="How this router handles the rare leap-second adjustment - smear spreads the extra second gradually to avoid a sudden clock jump, while other modes apply it the traditional abrupt way."
          >
            <select
              value={values.leapSecond}
              onChange={(e) => update('leapSecond', e.target.value)}
              className={inputClass}
            >
              <option value="">Default (timezone)</option>
              {NTP_LEAP_SECOND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </FieldLabel>
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save general settings
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Allowed clients</p>
          <ChipList
            values={config.allowClientAddresses}
            basePath={ntpAllowClientPath()}
            leaf="address"
            pathLabel="service ntp allow-client address"
            placeholder="192.0.2.0/24"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Listen addresses</p>
          <ChipList
            values={config.listenAddresses}
            basePath={ntpPath()}
            leaf="listen-address"
            pathLabel="service ntp listen-address"
            placeholder="192.0.2.1"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Source addresses</p>
          <ChipList
            values={config.sourceAddresses}
            basePath={ntpPath()}
            leaf="source-address"
            pathLabel="service ntp source-address"
            placeholder="192.0.2.1"
          />
        </div>
      </div>
    </div>
  )
}
