import { useState } from 'react'
import ChipList from '../ChipList'
import { sshAllowPath, sshDenyPath, sshDynamicProtectionPath, sshPath } from '../../lib/serviceSshParse'
import {
  blankSSHFormValues,
  disableSSHOp,
  enableSSHOp,
  sshConfigToFormValues,
  sshFormToOps,
} from '../../lib/serviceSshForm'
import { SSH_LOG_LEVELS, type SSHConfig } from '../../lib/serviceSshTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function SshSettings({ config }: { config: SSHConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">SSH access is not configured.</p>
        <button
          onClick={() => {
            const op = enableSSHOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable SSH (defaults: port 22, password auth allowed)
        </button>
      </div>
    )
  }

  return <SshSettingsForm config={config} />
}

function SshSettingsForm({ config }: { config: SSHConfig }) {
  const [values, setValues] = useState(() => sshConfigToFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankSSHFormValues>>(
    key: K,
    value: ReturnType<typeof blankSSHFormValues>[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = sshFormToOps(config, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
  }

  function queueDisable() {
    const op = disableSSHOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        This affects remote CLI/SFTP access to VyOS, not this app's own HTTPS API access. Disabling
        password authentication or the service entirely can lock out CLI access - commit-confirm
        ("Safe apply") is your safety net, same as everywhere else in this app.
      </p>

      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            Log level
            <select value={values.loglevel} onChange={(e) => update('loglevel', e.target.value)} className={inputClass}>
              <option value="">Default (info)</option>
              {SSH_LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <FieldLabel
            label="Client keepalive interval (s)"
            hint="How often the server pings an idle client to check it's still connected - separate from any TCP-level keepalive, this is SSH's own application-layer check."
          >
            <input
              {...noExtensionInputProps}
              value={values.clientKeepaliveInterval}
              onChange={(e) => update('clientKeepaliveInterval', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel
            label="Trusted user CA (PKI name)"
            hint="References a CA from the PKI tab - client keys signed by this CA (SSH certificates, not just plain public keys) are trusted for login without being individually listed."
          >
            <input
              {...noExtensionInputProps}
              value={values.trustedUserCA}
              onChange={(e) => update('trustedUserCA', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Rekey after data (MB)" hint="Forces a fresh session-key exchange once this much data has been transferred over a connection, limiting how much traffic any single key ever protects.">
            <input
              {...noExtensionInputProps}
              value={values.rekeyData}
              onChange={(e) => update('rekeyData', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Rekey after time (min)" hint="Forces a fresh session-key exchange once a connection has been open this long, regardless of how much data has passed.">
            <input
              {...noExtensionInputProps}
              value={values.rekeyTime}
              onChange={(e) => update('rekeyTime', e.target.value)}
              className={inputClass}
            />
          </FieldLabel>
        </div>

        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.disablePasswordAuthentication}
              onChange={(e) => update('disablePasswordAuthentication', e.target.checked)}
              className="accent-accent-500"
            />
            Disable password authentication (keys only)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.disableHostValidation}
              onChange={(e) => update('disableHostValidation', e.target.checked)}
              className="accent-accent-500"
            />
            Disable host validation
            <InfoTooltip text="Skips strict checking of this router's own SSH host key against clients' known_hosts files - weakens protection against man-in-the-middle connections to it." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.fidoPinRequired}
              onChange={(e) => update('fidoPinRequired', e.target.checked)}
              className="accent-accent-500"
            />
            FIDO: require PIN
            <InfoTooltip text="For hardware security-key (FIDO/U2F) logins, requires the key's PIN to be entered in addition to the physical key itself." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={values.fidoTouchRequired}
              onChange={(e) => update('fidoTouchRequired', e.target.checked)}
              className="accent-accent-500"
            />
            FIDO: require touch
            <InfoTooltip text="For hardware security-key logins, requires a physical touch/tap on the key to confirm presence, rather than accepting it silently." />
          </label>
        </div>

        <h3 className="mb-1 mt-4 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Dynamic protection (brute-force throttling)
          <InfoTooltip text="A fail2ban-style mechanism: temporarily bans a source address after too many failed login attempts within a time window." />
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <FieldLabel label="Block time (s)" hint="How long an offending address is banned once it crosses the threshold below.">
            <input
              {...noExtensionInputProps}
              value={values.dynamicProtectionBlockTime}
              onChange={(e) => update('dynamicProtectionBlockTime', e.target.value)}
              placeholder="120"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Detect time (s)" hint="The rolling time window failed attempts are counted within - old attempts age out after this long.">
            <input
              {...noExtensionInputProps}
              value={values.dynamicProtectionDetectTime}
              onChange={(e) => update('dynamicProtectionDetectTime', e.target.value)}
              placeholder="1800"
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Threshold" hint="Number of failed login attempts from one address, within the window set above, before it gets banned.">
            <input
              {...noExtensionInputProps}
              value={values.dynamicProtectionThreshold}
              onChange={(e) => update('dynamicProtectionThreshold', e.target.value)}
              placeholder="30"
              className={inputClass}
            />
          </FieldLabel>
        </div>

        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save settings
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ChipListField label="Ports" values={config.ports} basePath={sshPath()} leaf="port" pathLabel="service ssh port" placeholder="22" />
        <ChipListField label="Listen addresses" values={config.listenAddresses} basePath={sshPath()} leaf="listen-address" pathLabel="service ssh listen-address" placeholder="192.0.2.1" />
        <ChipListField label="VRFs" values={config.vrfs} basePath={sshPath()} leaf="vrf" pathLabel="service ssh vrf" placeholder="default" />
        <ChipListField
          label="Dynamic protection allow-list"
          values={config.dynamicProtectionAllowFrom}
          basePath={sshDynamicProtectionPath()}
          leaf="allow-from"
          pathLabel="service ssh dynamic-protection allow-from"
          placeholder="192.0.2.0/24"
        />
        <ChipListField label="Allowed groups" values={config.allowGroups} basePath={sshAllowPath()} leaf="group" pathLabel="service ssh access-control allow group" placeholder="admins" />
        <ChipListField label="Allowed users" values={config.allowUsers} basePath={sshAllowPath()} leaf="user" pathLabel="service ssh access-control allow user" placeholder="alice" />
        <ChipListField label="Denied groups" values={config.denyGroups} basePath={sshDenyPath()} leaf="group" pathLabel="service ssh access-control deny group" placeholder="guests" />
        <ChipListField label="Denied users" values={config.denyUsers} basePath={sshDenyPath()} leaf="user" pathLabel="service ssh access-control deny user" placeholder="bob" />
        <ChipListField label="Ciphers" values={config.ciphers} basePath={sshPath()} leaf="cipher" pathLabel="service ssh cipher" placeholder="aes256-gcm@openssh.com" />
        <ChipListField label="Host key algorithms" values={config.hostkeyAlgorithms} basePath={sshPath()} leaf="hostkey-algorithm" pathLabel="service ssh hostkey-algorithm" placeholder="ssh-ed25519" />
        <ChipListField label="Public key algorithms" values={config.pubkeyAcceptedAlgorithms} basePath={sshPath()} leaf="pubkey-accepted-algorithm" pathLabel="service ssh pubkey-accepted-algorithm" placeholder="ssh-ed25519" />
        <ChipListField label="Key exchange algorithms" values={config.keyExchangeAlgorithms} basePath={sshPath()} leaf="key-exchange" pathLabel="service ssh key-exchange" placeholder="curve25519-sha256" />
        <ChipListField label="MAC algorithms" values={config.macAlgorithms} basePath={sshPath()} leaf="mac" pathLabel="service ssh mac" placeholder="hmac-sha2-256" />
      </div>

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable SSH entirely
        </button>
      </div>
    </div>
  )
}

function ChipListField({
  label,
  values,
  basePath,
  leaf,
  pathLabel,
  placeholder,
}: {
  label: string
  values: string[]
  basePath: string[]
  leaf: string
  pathLabel: string
  placeholder?: string
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <ChipList values={values} basePath={basePath} leaf={leaf} pathLabel={pathLabel} placeholder={placeholder} />
    </div>
  )
}
