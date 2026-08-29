import { useState } from 'react'
import ChipList from '../ChipList'
import Snmpv3Section from './Snmpv3Section'
import { snmpCommunityPath } from '../../lib/serviceSnmpParse'
import {
  addSNMPCommunityOps,
  addSNMPListenAddressOps,
  addSNMPTrapTargetOps,
  blankSNMPSettingsFormValues,
  disableSNMPOp,
  enableSNMPOp,
  removeSNMPCommunityOp,
  removeSNMPListenAddressOp,
  removeSNMPTrapTargetOp,
  snmpConfigToFormValues,
  snmpSettingsFormToOps,
} from '../../lib/serviceSnmpForm'
import { SNMP_AUTHORIZATION_LEVELS, SNMP_PROTOCOLS, type SNMPConfig } from '../../lib/serviceSnmpTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function SnmpSettings({ config }: { config: SNMPConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">SNMP is not configured.</p>
        <button
          onClick={() => {
            const op = enableSNMPOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable SNMP
        </button>
      </div>
    )
  }

  return <SnmpSettingsForm config={config} />
}

function SnmpSettingsForm({ config }: { config: SNMPConfig }) {
  const [values, setValues] = useState(() => snmpConfigToFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankSNMPSettingsFormValues>>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function save() {
    const ops = snmpSettingsFormToOps(config, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  function queueDisable() {
    const op = disableSNMPOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
          v1/v2c (community-based)
        </h2>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Contact
            <input {...noExtensionInputProps} value={values.contact} onChange={(e) => update('contact', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Location
            <input {...noExtensionInputProps} value={values.location} onChange={(e) => update('location', e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Description
            <input {...noExtensionInputProps} value={values.description} onChange={(e) => update('description', e.target.value)} className={inputClass} />
          </label>
          <FieldLabel label="Trap source address" hint="Local interface address to send traps from - useful when the router has multiple addresses and the trap receiver expects them from a specific one.">
            <input {...noExtensionInputProps} value={values.trapSource} onChange={(e) => update('trapSource', e.target.value)} className={inputClass} />
          </FieldLabel>
          <FieldLabel label="Transport protocol" hint="Which socket family the SNMP daemon listens with - udp6/tcp6 bind an IPv6 socket instead of IPv4.">
            <select value={values.protocol} onChange={(e) => update('protocol', e.target.value)} className={inputClass}>
              <option value="">Default (udp)</option>
              {SNMP_PROTOCOLS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </FieldLabel>
        </div>
        <button onClick={save} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save settings
        </button>
      </div>

      <CommunitiesSection config={config} />
      <ListenAddressesSection config={config} />
      <TrapTargetsSection config={config} />

      <div className="border-t border-surface-border pt-6">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">SNMPv3</h2>
        <Snmpv3Section v3={config.v3} />
      </div>

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable SNMP entirely
        </button>
      </div>
    </div>
  )
}

function CommunitiesSection({ config }: { config: SNMPConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [authorization, setAuthorization] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedName = name.trim()
  const taken = config.communities.some((c) => c.name === trimmedName)
  const valid = trimmedName !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addSNMPCommunityOps(trimmedName, authorization)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setName('')
    setAuthorization('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
          Communities ({config.communities.length})
          <InfoTooltip text="An SNMPv1/v2c community string acts as a shared password - ro grants read-only access, rw allows changing values too. Restrict by client/network below since the string travels in plain text." />
        </h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add community'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-3 flex items-center gap-2">
          <input {...noExtensionInputProps} value={name} onChange={(e) => setName(e.target.value)} placeholder="public" className={inputClass} />
          <select value={authorization} onChange={(e) => setAuthorization(e.target.value)} className={inputClass}>
            <option value="">Default (ro)</option>
            {SNMP_AUTHORIZATION_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="text-xs text-danger-500">Already exists.</p>}
        </div>
      )}
      <div className="space-y-2">
        {config.communities.map((community) => (
          <div key={community.name} className="rounded-xl border border-surface-border bg-surface-900 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-white">
                {community.name}
                <span className="ml-2 text-xs text-slate-500">{community.authorization ?? 'ro'}</span>
              </span>
              <button
                onClick={() => {
                  const op = removeSNMPCommunityOp(community.name)
                  add({ op, label: `delete ${op.path.join(' ')}` })
                }}
                className="text-xs text-slate-500 hover:text-danger-500"
              >
                Remove
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ChipList values={community.clients} basePath={snmpCommunityPath(community.name)} leaf="client" pathLabel={`service snmp community ${community.name} client`} placeholder="192.0.2.1" />
              <ChipList values={community.networks} basePath={snmpCommunityPath(community.name)} leaf="network" pathLabel={`service snmp community ${community.name} network`} placeholder="192.0.2.0/24" />
            </div>
          </div>
        ))}
        {config.communities.length === 0 && <p className="text-xs text-slate-500">No communities configured yet.</p>}
      </div>
    </div>
  )
}

function ListenAddressesSection({ config }: { config: SNMPConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = address.trim()
  const taken = config.listenAddresses.some((l) => l.address === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addSNMPListenAddressOps(trimmed, port)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setPort('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Listen addresses ({config.listenAddresses.length})
        </h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 flex items-center gap-2">
          <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.0.2.1" className={inputClass} />
          <input {...noExtensionInputProps} value={port} onChange={(e) => setPort(e.target.value)} placeholder="port (default 161)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="text-xs text-danger-500">Already configured.</p>}
        </div>
      )}
      <div className="space-y-1">
        {config.listenAddresses.map((la) => (
          <div key={la.address} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {la.address}
              {la.port && <span className="text-slate-500">:{la.port}</span>}
            </span>
            <button
              onClick={() => {
                const op = removeSNMPListenAddressOp(la.address)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {config.listenAddresses.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}

function TrapTargetsSection({ config }: { config: SNMPConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [address, setAddress] = useState('')
  const [community, setCommunity] = useState('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmed = address.trim()
  const taken = config.trapTargets.some((t) => t.address === trimmed)
  const valid = trimmed !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addSNMPTrapTargetOps(trimmed, community, port)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setAddress('')
    setCommunity('')
    setPort('')
    setShowAdd(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Trap targets ({config.trapTargets.length})
        </h2>
        <button onClick={() => setShowAdd((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          <input {...noExtensionInputProps} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.0.2.2" className={inputClass} />
          <input {...noExtensionInputProps} value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="community" className={inputClass} />
          <input {...noExtensionInputProps} value={port} onChange={(e) => setPort(e.target.value)} placeholder="port (default 162)" className={inputClass} />
          <button onClick={submit} disabled={!valid} className={`col-span-3 bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          {taken && <p className="col-span-3 text-xs text-danger-500">Already configured.</p>}
        </div>
      )}
      <div className="space-y-1">
        {config.trapTargets.map((t) => (
          <div key={t.address} className="flex items-center justify-between rounded border border-surface-border p-2">
            <span className="font-mono text-xs text-slate-300">
              {t.address}
              {t.hasCommunity && (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  {' '}
                  · community set
                  <InfoTooltip text="The community string sent with each trap notification - most receivers must have a matching community configured to accept it." />
                </span>
              )}
              {t.port && <span className="text-slate-500">:{t.port}</span>}
            </span>
            <button
              onClick={() => {
                const op = removeSNMPTrapTargetOp(t.address)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
        ))}
        {config.trapTargets.length === 0 && <p className="text-xs text-slate-500">None configured.</p>}
      </div>
    </div>
  )
}
