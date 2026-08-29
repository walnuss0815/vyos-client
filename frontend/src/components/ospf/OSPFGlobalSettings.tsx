import { useState } from 'react'
import { globalFormToOps, globalToFormValues, type OSPFGlobalFormValues } from '../../lib/ospfGlobalForm'
import type { OSPFGlobalSettings as OSPFGlobalSettingsData, OSPFProtocol } from '../../lib/ospfTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'
import InfoTooltip from '../InfoTooltip'

/** Router ID, auto-cost, administrative distance, and default-route
 * origination - the global settings someone would realistically tune
 * day-to-day. Everything else under `parameters`/process-wide tuning
 * (ABR type, rfc1583-compatibility, max-metric, graceful-restart,
 * ldp-sync, refresh/SPF-throttle timers, ...) stays Config-Tree-only -
 * see ospfTypes.ts's doc comment for the full list. */
export default function OSPFGlobalSettings({
  protocol,
  settings,
}: {
  protocol: OSPFProtocol
  settings: OSPFGlobalSettingsData
}) {
  const [values, setValues] = useState<OSPFGlobalFormValues>(() => globalToFormValues(settings))
  const [dirty, setDirty] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  function update<K extends keyof OSPFGlobalFormValues>(key: K, value: OSPFGlobalFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    setDirty(true)
  }

  function submit() {
    const ops = globalFormToOps(protocol, settings, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setDirty(false)
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Global settings</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Router ID
          <input
            {...noExtensionInputProps}
            value={values.routerId}
            onChange={(e) => update('routerId', e.target.value)}
            placeholder="192.0.2.1"
            className={inputClass}
          />
        </label>
        <FieldLabel
          label="Auto-cost reference bandwidth (Mbit/s)"
          hint="The link speed OSPF treats as cost 1 when computing interface costs automatically - raising it lets faster links get distinct, meaningfully lower costs than slower ones, since cost is bandwidth-relative."
        >
          <input
            {...noExtensionInputProps}
            value={values.autoCostReferenceBandwidth}
            onChange={(e) => update('autoCostReferenceBandwidth', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="100"
            className={inputClass}
          />
        </FieldLabel>
        {protocol === 'ospf' && (
          <FieldLabel
            label="Default metric (redistributed routes)"
            hint="The metric applied to routes imported from another protocol when the redistribution entry itself doesn't specify its own explicit value."
          >
            <input
              {...noExtensionInputProps}
              value={values.defaultMetric}
              onChange={(e) => update('defaultMetric', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputClass}
            />
          </FieldLabel>
        )}
        <FieldLabel label="Distance (global)" hint="The administrative distance for any OSPF route not covered by one of the more specific distance fields here.">
          <input
            {...noExtensionInputProps}
            value={values.distanceGlobal}
            onChange={(e) => update('distanceGlobal', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Distance (external)" hint="Administrative distance specifically for routes learned from outside OSPF and redistributed in (Type-5/Type-7 external routes).">
          <input
            {...noExtensionInputProps}
            value={values.distanceExternal}
            onChange={(e) => update('distanceExternal', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Distance (inter-area)" hint="Administrative distance specifically for routes to networks in a different OSPF area than the one they're being evaluated in.">
          <input
            {...noExtensionInputProps}
            value={values.distanceInterArea}
            onChange={(e) => update('distanceInterArea', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel label="Distance (intra-area)" hint="Administrative distance specifically for routes to networks within the same OSPF area.">
          <input
            {...noExtensionInputProps}
            value={values.distanceIntraArea}
            onChange={(e) => update('distanceIntraArea', e.target.value.replace(/[^0-9]/g, ''))}
            className={inputClass}
          />
        </FieldLabel>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={values.defaultInformationOriginateAlways}
            onChange={(e) => update('defaultInformationOriginateAlways', e.target.checked)}
            className="accent-accent-500"
          />
          Always originate a default route
          <InfoTooltip text="Normally a default route is only originated if one already exists elsewhere in this router's routing table - this bypasses that check and originates one unconditionally." />
        </label>
        <FieldLabel label="Default-route metric" hint="The metric advertised on the default route this router injects into OSPF.">
          <input
            {...noExtensionInputProps}
            value={values.defaultInformationOriginateMetric}
            onChange={(e) =>
              update('defaultInformationOriginateMetric', e.target.value.replace(/[^0-9]/g, ''))
            }
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel
          label="Default-route metric type"
          hint="E1 (1) adds the route's internal OSPF cost on top of the external metric as it's advertised through the network; E2 (2) advertises the external metric unchanged everywhere."
        >
          <select
            value={values.defaultInformationOriginateMetricType}
            onChange={(e) =>
              update(
                'defaultInformationOriginateMetricType',
                e.target.value as OSPFGlobalFormValues['defaultInformationOriginateMetricType'],
              )
            }
            className={inputClass}
          >
            <option value="">(default: 2)</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </FieldLabel>
      </div>
      <button
        onClick={submit}
        disabled={!dirty}
        className={`mt-3 bg-accent-600 ${buttonClass}`}
      >
        Save global settings
      </button>
    </div>
  )
}
