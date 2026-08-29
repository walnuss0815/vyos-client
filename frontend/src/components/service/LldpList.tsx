import { useState } from 'react'
import ChipList from '../ChipList'
import { lldpPath } from '../../lib/serviceLldpParse'
import {
  blankLLDPGeneralFormValues,
  blankLLDPInterfaceFormValues,
  deleteLLDPInterfaceOp,
  disableLLDPOp,
  enableLLDPOp,
  lldpConfigToGeneralFormValues,
  lldpGeneralFormToOps,
  lldpInterfaceFormToOps,
  lldpInterfaceToFormValues,
  type LLDPInterfaceFormValues,
} from '../../lib/serviceLldpForm'
import { LLDP_DATUMS, LLDP_MODES, type LLDPConfig, type LLDPInterface } from '../../lib/serviceLldpTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

export default function LldpList({ config }: { config: LLDPConfig }) {
  const add = usePendingChangesStore((s) => s.add)

  if (!config.enabled) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-3 text-sm text-slate-400">LLDP is not configured.</p>
        <button
          onClick={() => {
            const op = enableLLDPOp()
            add({ op, label: `set ${op.path.join(' ')}` })
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Enable LLDP
        </button>
      </div>
    )
  }

  return <LldpEnabled config={config} />
}

function LldpEnabled({ config }: { config: LLDPConfig }) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [values, setValues] = useState(() => lldpConfigToGeneralFormValues(config))
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof ReturnType<typeof blankLLDPGeneralFormValues>>(key: K, value: boolean) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function saveGeneral() {
    const ops = lldpGeneralFormToOps(lldpConfigToGeneralFormValues(config), values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}` })
  }

  function queueDelete(name: string) {
    const op = deleteLLDPInterfaceOp(name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  function queueDisable() {
    const op = disableLLDPOp()
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingName ? config.interfaces.find((i) => i.interfaceName === editingName) : undefined

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Legacy protocols &amp; SNMP</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.legacyCdp} onChange={(e) => update('legacyCdp', e.target.checked)} className="accent-accent-500" />
            CDP
            <InfoTooltip text="Cisco Discovery Protocol - also speaks Cisco's own neighbor-discovery protocol alongside standard LLDP, for interoperability with Cisco gear." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.legacyEdp} onChange={(e) => update('legacyEdp', e.target.checked)} className="accent-accent-500" />
            EDP
            <InfoTooltip text="Extreme Discovery Protocol - Extreme Networks' own neighbor-discovery protocol." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.legacyFdp} onChange={(e) => update('legacyFdp', e.target.checked)} className="accent-accent-500" />
            FDP
            <InfoTooltip text="Foundry Discovery Protocol - Foundry/Brocade's own neighbor-discovery protocol." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.legacySonmp} onChange={(e) => update('legacySonmp', e.target.checked)} className="accent-accent-500" />
            SONMP
            <InfoTooltip text="Nortel's own neighbor-discovery protocol (Synoptics Network Management Protocol)." />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={values.snmp} onChange={(e) => update('snmp', e.target.checked)} className="accent-accent-500" />
            Advertise via SNMP
            <InfoTooltip text="Makes neighbor information collected by LLDP also queryable over SNMP, in addition to the CLI/API." />
          </label>
        </div>
        <button onClick={saveGeneral} className={`mt-3 bg-accent-600 ${buttonClass}`}>
          Save
        </button>
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Management addresses</p>
          <ChipList values={config.managementAddresses} basePath={lldpPath()} leaf="management-address" pathLabel="service lldp management-address" placeholder="192.0.2.1" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Interfaces ({config.interfaces.length})
          </h2>
          <button
            onClick={() => {
              setShowCreate((v) => !v)
              setEditingName(null)
            }}
            className={`bg-accent-600 ${buttonClass}`}
          >
            {showCreate ? 'Cancel' : '+ New interface'}
          </button>
        </div>

        {showCreate && (
          <div className="mb-3">
            <InterfaceForm existingNames={config.interfaces.map((i) => i.interfaceName)} onDone={() => setShowCreate(false)} />
          </div>
        )}
        {editing && (
          <div className="mb-3">
            <InterfaceForm
              iface={editing}
              existingNames={config.interfaces.map((i) => i.interfaceName)}
              onDone={() => setEditingName(null)}
            />
          </div>
        )}

        <div className="space-y-2">
          {config.interfaces.map((iface) => (
            <div key={iface.interfaceName} className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-900 p-3">
              <div>
                <span className="font-mono text-sm text-white">{iface.interfaceName}</span>
                <span className="ml-2 text-xs text-slate-500">{iface.mode ?? 'rx-tx'}</span>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingName(iface.interfaceName)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(iface.interfaceName)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {config.interfaces.length === 0 && <p className="text-xs text-slate-500">No interfaces configured yet.</p>}
        </div>
      </div>

      <div>
        <button onClick={queueDisable} className="text-xs text-danger-500 hover:text-danger-400">
          Disable LLDP entirely
        </button>
      </div>
    </div>
  )
}

function InterfaceForm({
  iface,
  existingNames,
  onDone,
}: {
  iface?: LLDPInterface
  existingNames: string[]
  onDone: () => void
}) {
  const [interfaceName, setInterfaceName] = useState(iface?.interfaceName ?? '')
  const [values, setValues] = useState<LLDPInterfaceFormValues>(
    iface ? lldpInterfaceToFormValues(iface) : blankLLDPInterfaceFormValues(),
  )
  const add = usePendingChangesStore((s) => s.add)

  const isCreate = iface === undefined
  const trimmedName = interfaceName.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const canSubmit = trimmedName !== '' && !nameTaken

  function update<K extends keyof LLDPInterfaceFormValues>(key: K, value: LLDPInterfaceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!canSubmit) return
    const ops = lldpInterfaceFormToOps(trimmedName, iface, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    onDone()
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{isCreate ? 'New interface' : `Edit ${iface.interfaceName}`}</h3>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Interface (or "all") *
          <input
            {...noExtensionInputProps}
            autoFocus
            disabled={!isCreate}
            value={interfaceName}
            onChange={(e) => setInterfaceName(e.target.value)}
            placeholder="eth0"
            className={`${inputClass} disabled:opacity-60`}
          />
          {nameTaken && <span className="text-danger-500">This interface already has LLDP configured.</span>}
        </label>
        <FieldLabel
          label="Mode"
          hint="Whether this interface only sends its own LLDP advertisements (tx), only listens for neighbors' (rx), or both - rx-tx is the usual choice for full neighbor discovery."
        >
          <select value={values.mode} onChange={(e) => update('mode', e.target.value)} className={inputClass}>
            <option value="">Default (rx-tx)</option>
            {LLDP_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel
          label="ELIN (911) number"
          hint="Emergency Location Identification Number - a callback number advertised for this interface, used by emergency-services location systems (e.g. VoIP E911)."
        >
          <input {...noExtensionInputProps} value={values.elin} onChange={(e) => update('elin', e.target.value)} className={inputClass} />
        </FieldLabel>
      </div>

      <p className="mb-1 mt-3 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        Location (coordinate-based, optional)
        <InfoTooltip text="Advertises this interface's physical GPS-style position to neighbors - VyOS only supports this coordinate form, not a civic/street-address alternative." />
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={labelClass}>
          Altitude
          <input {...noExtensionInputProps} value={values.altitude} onChange={(e) => update('altitude', e.target.value)} placeholder="0" className={inputClass} />
        </label>
        <FieldLabel label="Datum" hint="The geodetic reference system the coordinates below are expressed in - WGS84 is the standard used by GPS and most mapping systems.">
          <select value={values.datum} onChange={(e) => update('datum', e.target.value)} className={inputClass}>
            <option value="">Default (WGS84)</option>
            {LLDP_DATUMS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </FieldLabel>
        <label className={labelClass}>
          Latitude
          <input {...noExtensionInputProps} value={values.latitude} onChange={(e) => update('latitude', e.target.value)} placeholder="37.524449N" className={inputClass} />
        </label>
        <label className={labelClass}>
          Longitude
          <input {...noExtensionInputProps} value={values.longitude} onChange={(e) => update('longitude', e.target.value)} placeholder="122.267255W" className={inputClass} />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {isCreate ? 'Queue creation' : 'Save changes'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
      </div>
    </div>
  )
}
