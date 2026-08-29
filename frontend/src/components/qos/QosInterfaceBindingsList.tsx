import { useState } from 'react'
import { deleteQosInterfaceBindingOp, setQosInterfaceDirectionOp } from '../../lib/qosInterfaceForm'
import type { QosConfig } from '../../lib/qosTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

/** `qos interface <ifname> { ingress <policy>, egress <policy> }` -
 * VyOS enforces at commit time that `ingress` may only reference a
 * `limiter` policy and `egress` may only reference one of the other
 * types, so the two dropdowns here are pre-filtered accordingly
 * (`ingressPolicies`/`egressPolicies`, both derived from sibling
 * policy lists in the same useQosConfig() fetch) rather than letting
 * a mismatched selection reach VyOS's own commit-time error. */
export default function QosInterfaceBindingsList({ qos }: { qos: QosConfig }) {
  const [showAdd, setShowAdd] = useState(false)
  const [newIfname, setNewIfname] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const ingressPolicies = qos.limiterPolicies.map((p) => p.name)
  const egressPolicies = [
    ...qos.shaperPolicies.map((p) => p.name),
    ...qos.shaperHfscPolicies.map((p) => p.name),
    ...qos.cakePolicies.map((p) => p.name),
    ...qos.fqCodelPolicies.map((p) => p.name),
    ...qos.priorityQueuePolicies.map((p) => p.name),
    ...qos.roundRobinPolicies.map((p) => p.name),
    ...qos.rateControlPolicies.map((p) => p.name),
  ].sort((a, b) => a.localeCompare(b))

  const existingIfnames = qos.interfaces.map((b) => b.interface)

  function queueDelete(ifname: string) {
    add({ op: deleteQosInterfaceBindingOp(ifname), label: `delete qos interface ${ifname}` })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Interface bindings
          <InfoTooltip text="Attaches a named policy to an interface, in a given direction. Ingress only accepts limiter policies (policing); egress accepts every other policy type." />
        </p>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add interface'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 flex items-center gap-2">
          <input
            {...noExtensionInputProps}
            value={newIfname}
            onChange={(e) => setNewIfname(e.target.value)}
            placeholder="eth0"
            className={`font-mono ${inputClass}`}
          />
          <button
            onClick={() => {
              const trimmed = newIfname.trim()
              if (!trimmed || existingIfnames.includes(trimmed)) return
              // No bare "set" op here - unlike policy tagNodes, a
              // `qos interface <ifname>` node isn't meaningful until
              // at least one direction is actually set below.
              setNewIfname('')
              setShowAdd(false)
            }}
            disabled={!newIfname.trim() || existingIfnames.includes(newIfname.trim())}
            className={`bg-accent-600 ${buttonClass}`}
          >
            Configure
          </button>
        </div>
      )}

      {qos.interfaces.length === 0 && <p className="text-xs text-slate-500">No interfaces have a QoS policy applied yet.</p>}

      <div className="space-y-2">
        {qos.interfaces.map((binding) => (
          <BindingRow
            key={binding.interface}
            interfaceName={binding.interface}
            ingress={binding.ingress}
            egress={binding.egress}
            ingressPolicies={ingressPolicies}
            egressPolicies={egressPolicies}
            onDelete={() => queueDelete(binding.interface)}
          />
        ))}
        {showAdd && newIfname.trim() !== '' && !existingIfnames.includes(newIfname.trim()) && (
          <BindingRow
            interfaceName={newIfname.trim()}
            ingress={undefined}
            egress={undefined}
            ingressPolicies={ingressPolicies}
            egressPolicies={egressPolicies}
            onDelete={() => {}}
            isNew
          />
        )}
      </div>
    </div>
  )
}

function BindingRow({
  interfaceName,
  ingress,
  egress,
  ingressPolicies,
  egressPolicies,
  onDelete,
  isNew,
}: {
  interfaceName: string
  ingress?: string
  egress?: string
  ingressPolicies: string[]
  egressPolicies: string[]
  onDelete: () => void
  isNew?: boolean
}) {
  const add = usePendingChangesStore((s) => s.add)

  function setDirection(direction: 'ingress' | 'egress', value: string) {
    const op = setQosInterfaceDirectionOp(interfaceName, direction, value)
    add({ op, label: `${op.op} qos interface ${interfaceName} ${direction}${value ? ` '${value}'` : ''}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-sm text-white">{interfaceName}</span>
        {!isNew && (
          <button onClick={onDelete} className="text-xs text-slate-500 hover:text-danger-500">
            Delete
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={labelClass}>
          Ingress (limiter only)
          <select value={ingress ?? ''} onChange={(e) => setDirection('ingress', e.target.value)} className={inputClass}>
            <option value="">(none)</option>
            {ingressPolicies.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Egress
          <select value={egress ?? ''} onChange={(e) => setDirection('egress', e.target.value)} className={inputClass}>
            <option value="">(none)</option>
            {egressPolicies.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
