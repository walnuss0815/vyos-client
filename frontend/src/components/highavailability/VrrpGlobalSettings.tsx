import { useState } from 'react'
import { toggleHADisableOp, toggleVrrpSnmpTrapOp, vrrpGlobalFormToOps, type VRRPGlobalFormValues } from '../../lib/haVrrpForm'
import type { HAConfig } from '../../lib/haTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

function toFormValues(ha: HAConfig): VRRPGlobalFormValues {
  return {
    startupDelay: ha.global.startupDelay !== undefined ? String(ha.global.startupDelay) : '',
    version: ha.global.version ?? '',
    garpInterval: ha.global.garp.interval,
    garpMasterDelay: String(ha.global.garp.masterDelay),
    garpMasterRefresh: String(ha.global.garp.masterRefresh),
    garpMasterRefreshRepeat: String(ha.global.garp.masterRefreshRepeat),
    garpMasterRepeat: String(ha.global.garp.masterRepeat),
  }
}

/** `high-availability disable`, `vrrp snmp trap` (queued immediately -
 * standalone toggles, matching WanGlobalSettings.tsx's convention) and
 * `vrrp global-parameters` (startup-delay/version/garp - a small
 * "Save" form, since these are edited together). */
export default function VrrpGlobalSettings({ ha }: { ha: HAConfig }) {
  const add = usePendingChangesStore((s) => s.add)
  const before = toFormValues(ha)
  const [values, setValues] = useState<VRRPGlobalFormValues>(before)

  function update<K extends keyof VRRPGlobalFormValues>(key: K, value: VRRPGlobalFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = vrrpGlobalFormToOps(before, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="mb-6 rounded-xl border border-surface-border bg-surface-900 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Global settings</p>

      <div className="mb-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={ha.disabled}
            onChange={(e) => {
              const op = toggleHADisableOp(e.target.checked)
              add({ op, label: `${op.op} high-availability disable` })
            }}
            className="accent-accent-500"
          />
          Disable High Availability entirely
          <InfoTooltip text="Turns off VRRP (and the IPVS load-balancer feature) as a whole - different from disabling one specific group below." />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={ha.global.snmpTrap}
            onChange={(e) => {
              const op = toggleVrrpSnmpTrapOp(e.target.checked)
              add({ op, label: `${op.op} high-availability vrrp snmp trap` })
            }}
            className="accent-accent-500"
          />
          Enable SNMP traps
        </label>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className={labelClass}>
          Startup delay (seconds, optional)
          <input
            {...noExtensionInputProps}
            value={values.startupDelay}
            onChange={(e) => update('startupDelay', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Default VRRP version
          <select value={values.version} onChange={(e) => update('version', e.target.value)} className={inputClass}>
            <option value="">(VyOS default)</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Gratuitous ARP defaults
          <InfoTooltip text="Applies to every group unless a group overrides its own GARP timing directly in the Config Tree." />
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input
            {...noExtensionInputProps}
            value={values.garpInterval}
            onChange={(e) => update('garpInterval', e.target.value)}
            placeholder="interval"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.garpMasterDelay}
            onChange={(e) => update('garpMasterDelay', e.target.value)}
            placeholder="master-delay"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.garpMasterRefresh}
            onChange={(e) => update('garpMasterRefresh', e.target.value)}
            placeholder="master-refresh"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.garpMasterRefreshRepeat}
            onChange={(e) => update('garpMasterRefreshRepeat', e.target.value)}
            placeholder="refresh-repeat"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={values.garpMasterRepeat}
            onChange={(e) => update('garpMasterRepeat', e.target.value)}
            placeholder="master-repeat"
            className={inputClass}
          />
        </div>
      </div>

      <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
        Save global settings
      </button>
    </div>
  )
}
