import { useState } from 'react'
import { blankGlobalFormValues, globalFormToOps, globalToFormValues } from '../../lib/bgpGlobalForm'
import type { BGPConfig } from '../../lib/bgpTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import FieldLabel from '../FieldLabel'

/** System AS and router ID - the two settings every BGP deployment
 * needs regardless of neighbor/peer-group count. Everything else
 * under `protocols bgp parameters` (dozens of process-wide tuning
 * knobs - see bgpTypes.ts's doc comment) stays Config-Tree-only. */
export default function BGPGlobalSettings({ bgp }: { bgp: BGPConfig }) {
  const [values, setValues] = useState(() => globalToFormValues(bgp))
  const [dirty, setDirty] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  function update(key: keyof ReturnType<typeof blankGlobalFormValues>, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
    setDirty(true)
  }

  function submit() {
    const ops = globalFormToOps(bgp, values)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setDirty(false)
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">Global settings</h2>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="System AS *" hint="This router's own autonomous-system number - identifies which routing domain it belongs to.">
          <input
            {...noExtensionInputProps}
            value={values.systemAs}
            onChange={(e) => update('systemAs', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="64512"
            className={inputClass}
          />
        </FieldLabel>
        <FieldLabel
          label="Router ID"
          hint="A dotted-quad identifier for this router within BGP - doesn't need to be a real, reachable address, just unique among the routers it peers with."
        >
          <input
            {...noExtensionInputProps}
            value={values.routerId}
            onChange={(e) => update('routerId', e.target.value)}
            placeholder="192.0.2.1"
            className={inputClass}
          />
        </FieldLabel>
      </div>
      <button
        onClick={submit}
        disabled={!dirty || values.systemAs.trim() === ''}
        className={`mt-3 bg-accent-600 ${buttonClass}`}
      >
        Save global settings
      </button>
    </div>
  )
}
