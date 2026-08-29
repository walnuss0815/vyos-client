import { useState } from 'react'
import {
  addLocalFacilityOps,
  addRemoteFacilityOps,
  addRemoteHostOps,
  deleteRemoteHostOp,
  removeLocalFacilityOp,
  removeRemoteFacilityOp,
  setRemotePortOp,
  setRemoteProtocolOp,
} from '../../lib/systemSyslogForm'
import { SYSLOG_FACILITIES, SYSLOG_LEVELS, type SyslogRemoteHost, type SystemSyslogConfig } from '../../lib/systemTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

/** Local and remote syslog destinations, each a set of facility/level
 * rules. Mirrors BGPNetworksAndRedistribution.tsx's two-simple-lists
 * layout. TLS-encrypted remote logging, console logging, and global
 * settings (marker messages, preserve-fqdn) stay Config-Tree-only -
 * see docs/roadmap.md. */
export default function SyslogSection({ syslog }: { syslog: SystemSyslogConfig }) {
  return (
    <div className="space-y-4">
      <LocalSection facilities={syslog.local} />
      <RemoteSection hosts={syslog.remote} />
    </div>
  )
}

function LocalSection({ facilities }: { facilities: SystemSyslogConfig['local'] }) {
  const [facility, setFacility] = useState<string>(SYSLOG_FACILITIES[0])
  const [level, setLevel] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const taken = facilities.some((f) => f.facility === facility)

  function submit() {
    if (taken) return
    const ops = addLocalFacilityOps(facility, level)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setLevel('')
  }

  function queueRemove(f: string) {
    const op = removeLocalFacilityOp(f)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
        Local logging (/var/log/messages)
        <InfoTooltip text="Facility classifies which subsystem generated a message (auth, daemon, kernel, local0-7, etc); level sets the minimum severity to record for that facility - lower-numbered levels (emerg, alert) are more severe than higher ones (info, debug)." />
      </h2>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select aria-label="Local facility" value={facility} onChange={(e) => setFacility(e.target.value)} className={inputClass}>
          {SYSLOG_FACILITIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select aria-label="Local level" value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
          <option value="">level (default: err)</option>
          {SYSLOG_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button onClick={submit} disabled={taken} className={`bg-accent-600 ${buttonClass}`}>
          Add
        </button>
      </div>
      {taken && <p className="mb-2 text-xs text-danger-500">This facility already has a rule.</p>}
      <ul className="space-y-1">
        {facilities.map((f) => (
          <li key={f.facility} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              {f.facility}
              {f.level && <span className="text-slate-500"> level {f.level}</span>}
            </span>
            <button onClick={() => queueRemove(f.facility)} className="text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </li>
        ))}
        {facilities.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
    </div>
  )
}

function RemoteSection({ hosts }: { hosts: SyslogRemoteHost[] }) {
  const [showCreate, setShowCreate] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(address: string) {
    const op = deleteRemoteHostOp(address)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
          Remote logging ({hosts.length})
          <InfoTooltip text="Ships log messages to an external syslog collector - udp is the traditional default (lower overhead, no delivery guarantee); tcp trades a bit of overhead for reliable delivery." />
        </h2>
        <button onClick={() => setShowCreate((v) => !v)} className={`bg-accent-600 ${buttonClass}`}>
          {showCreate ? 'Cancel' : '+ New remote host'}
        </button>
      </div>

      {showCreate && (
        <CreateRemoteHostForm existingAddresses={hosts.map((h) => h.address)} onDone={() => setShowCreate(false)} />
      )}

      <div className="space-y-2">
        {hosts.map((host) => (
          <div key={host.address} className="rounded-lg border border-surface-border bg-surface-800/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-sm text-white">
                {host.address}
                {host.protocol && <span className="ml-1 text-xs text-slate-500">({host.protocol})</span>}
                {host.port && <span className="ml-1 text-xs text-slate-500">:{host.port}</span>}
              </span>
              <button onClick={() => queueDelete(host.address)} className="text-xs text-slate-500 hover:text-danger-500">
                Delete
              </button>
            </div>
            <RemoteFacilitiesList host={host} />
          </div>
        ))}
        {hosts.length === 0 && <p className="text-xs text-slate-500">No remote logging hosts configured yet.</p>}
      </div>
    </div>
  )
}

function RemoteFacilitiesList({ host }: { host: SyslogRemoteHost }) {
  const [showAdd, setShowAdd] = useState(false)
  const [facility, setFacility] = useState<string>(SYSLOG_FACILITIES[0])
  const [level, setLevel] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const taken = host.facilities.some((f) => f.facility === facility)

  function submit() {
    if (taken) return
    const ops = addRemoteFacilityOps(host.address, facility, level)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setLevel('')
    setShowAdd(false)
  }

  function queueRemove(f: string) {
    const op = removeRemoteFacilityOp(host.address, f)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  function queueProtocol(protocol: 'tcp' | 'udp') {
    const op = setRemoteProtocolOp(host.address, protocol)
    add({ op, label: `set ${op.path.join(' ')} '${protocol}'` })
  }

  function queuePort(port: string) {
    if (!port.trim()) return
    const op = setRemotePortOp(host.address, port.trim())
    add({ op, label: `set ${op.path.join(' ')} '${port.trim()}'` })
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs text-slate-500">Facility rules</p>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => queueProtocol('tcp')} className="text-accent-500 hover:text-accent-400">
            set tcp
          </button>
          <button onClick={() => queueProtocol('udp')} className="text-accent-500 hover:text-accent-400">
            set udp
          </button>
          <button onClick={() => setShowAdd((v) => !v)} className="text-accent-500 hover:text-accent-400">
            {showAdd ? 'Cancel' : '+ Add rule'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="my-2 flex flex-wrap items-center gap-2">
          <select aria-label={`Facility for ${host.address}`} value={facility} onChange={(e) => setFacility(e.target.value)} className={inputClass}>
            {SYSLOG_FACILITIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select aria-label={`Level for ${host.address}`} value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
            <option value="">level (default: err)</option>
            {SYSLOG_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button onClick={submit} disabled={taken} className={`bg-accent-600 ${buttonClass}`}>
            Add
          </button>
          <input
            {...noExtensionInputProps}
            onKeyDown={(e) => {
              if (e.key === 'Enter') queuePort((e.target as HTMLInputElement).value)
            }}
            placeholder="port (press Enter)"
            className={`w-32 ${inputClass}`}
          />
        </div>
      )}

      <ul className="space-y-1">
        {host.facilities.map((f) => (
          <li key={f.facility} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              {f.facility}
              {f.level && <span className="text-slate-500"> level {f.level}</span>}
            </span>
            <button onClick={() => queueRemove(f.facility)} className="text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </li>
        ))}
        {host.facilities.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
    </div>
  )
}

function CreateRemoteHostForm({
  existingAddresses,
  onDone,
}: {
  existingAddresses: string[]
  onDone: () => void
}) {
  const [address, setAddress] = useState('')
  const [facility, setFacility] = useState<string>(SYSLOG_FACILITIES[0])
  const [level, setLevel] = useState('')
  const [protocol, setProtocol] = useState<'' | 'tcp' | 'udp'>('')
  const [port, setPort] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedAddress = address.trim()
  const taken = existingAddresses.includes(trimmedAddress)
  const valid = trimmedAddress !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addRemoteHostOps(trimmedAddress, facility, level, protocol, port)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    onDone()
  }

  return (
    <div className="mb-3 rounded-lg border border-surface-border p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          {...noExtensionInputProps}
          autoFocus
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="10.0.0.1"
          className={inputClass}
        />
        <select aria-label="New remote host facility" value={facility} onChange={(e) => setFacility(e.target.value)} className={inputClass}>
          {SYSLOG_FACILITIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select aria-label="New remote host level" value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
          <option value="">level (default: err)</option>
          {SYSLOG_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="New remote host protocol"
          value={protocol}
          onChange={(e) => setProtocol(e.target.value as '' | 'tcp' | 'udp')}
          className={inputClass}
        >
          <option value="">protocol (default: udp)</option>
          <option value="udp">udp</option>
          <option value="tcp">tcp</option>
        </select>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          {...noExtensionInputProps}
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="port (default: 514)"
          className={`w-40 ${inputClass}`}
        />
        <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
          Queue host creation
        </button>
      </div>
      {taken && <p className="mt-1 text-xs text-danger-500">This host is already configured.</p>}
    </div>
  )
}
