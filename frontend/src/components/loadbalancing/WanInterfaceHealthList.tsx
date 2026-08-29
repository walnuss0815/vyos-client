import { useState } from 'react'
import {
  addWANHealthTestOps,
  blankInterfaceHealthFormValues,
  interfaceHealthFormToOps,
  interfaceHealthToFormValues,
  removeInterfaceHealthOp,
  removeWANHealthTestOp,
  type InterfaceHealthFormValues,
} from '../../lib/loadBalancingWanForm'
import { WAN_HEALTH_TEST_TYPES, type WANInterfaceHealth } from '../../lib/loadBalancingTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

/** `interface-health <ifname>` list - WAN load-balancing requires at
 * least one of these to be configured at all (VyOS's own conf-mode
 * script raises a ConfigError otherwise), so this is presented as the
 * first, most essential section of the WAN tab. Each entry's nested
 * `test <id>` list (the actual ping/ttl/user-defined health probes) is
 * a second level of nesting, handled by WanHealthTestsSection below -
 * mirrors IpsecSiteToSite.tsx's peer-then-tunnel two-level pattern. */
export default function WanInterfaceHealthList({ interfaceHealth }: { interfaceHealth: WANInterfaceHealth[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = interfaceHealth.map((h) => h.interface)

  function queueRemove(ifname: string) {
    add({ op: removeInterfaceHealthOp(ifname), label: `delete load-balancing wan interface-health ${ifname}` })
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Interface health checks
          <InfoTooltip text="At least one interface must have a health check configured for WAN load-balancing to work at all - VyOS refuses to apply the configuration otherwise." />
        </p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditing(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add interface'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-surface-border bg-surface-900 p-4">
          <InterfaceHealthForm existingNames={existingNames} onDone={() => setShowAdd(false)} />
        </div>
      )}

      {interfaceHealth.length === 0 && !showAdd && (
        <p className="text-xs text-slate-500">No interface health checks configured yet.</p>
      )}

      <div className="space-y-3">
        {interfaceHealth.map((health) => (
          <div key={health.interface} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            {editing === health.interface ? (
              <InterfaceHealthForm health={health} existingNames={existingNames} onDone={() => setEditing(null)} />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-white">{health.interface}</span>
                  <div>
                    <button
                      onClick={() => {
                        setEditing(health.interface)
                        setShowAdd(false)
                      }}
                      className="text-xs text-accent-500 hover:text-accent-400"
                    >
                      Edit
                    </button>{' '}
                    <button
                      onClick={() => queueRemove(health.interface)}
                      className="ml-2 text-xs text-slate-500 hover:text-danger-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  nexthop {health.nexthop ?? '—'} · failure count {health.failureCount} · success count{' '}
                  {health.successCount}
                </p>
                <WanHealthTestsSection health={health} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function InterfaceHealthForm({
  health,
  existingNames,
  onDone,
}: {
  health?: WANInterfaceHealth
  existingNames: string[]
  onDone: () => void
}) {
  const add = usePendingChangesStore((s) => s.add)
  const [ifname, setIfname] = useState(health?.interface ?? '')
  const [values, setValues] = useState<InterfaceHealthFormValues>(
    health ? interfaceHealthToFormValues(health) : blankInterfaceHealthFormValues(),
  )

  const trimmed = ifname.trim()
  const taken = !health && existingNames.includes(trimmed)
  const valid = trimmed !== '' && !taken

  function update<K extends keyof InterfaceHealthFormValues>(key: K, value: InterfaceHealthFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!valid) return
    const ops = interfaceHealthFormToOps(trimmed, health, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    onDone()
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className={labelClass}>
          Interface
          <input
            {...noExtensionInputProps}
            value={ifname}
            disabled={!!health}
            onChange={(e) => setIfname(e.target.value)}
            placeholder="eth0"
            className={`font-mono ${inputClass}`}
          />
        </label>
        <label className={labelClass}>
          Nexthop
          <input
            {...noExtensionInputProps}
            value={values.nexthop}
            onChange={(e) => update('nexthop', e.target.value)}
            placeholder="192.0.2.1 or dhcp"
            className={`font-mono ${inputClass}`}
          />
        </label>
        <label className={labelClass}>
          Failure count
          <input
            {...noExtensionInputProps}
            value={values.failureCount}
            onChange={(e) => update('failureCount', e.target.value)}
            placeholder="1"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Success count
          <input
            {...noExtensionInputProps}
            value={values.successCount}
            onChange={(e) => update('successCount', e.target.value)}
            placeholder="1"
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
          {health ? 'Save' : 'Add interface'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-300">
          Cancel
        </button>
        {taken && <span className="text-xs text-danger-500">This interface already has a health check.</span>}
      </div>
    </div>
  )
}

function WanHealthTestsSection({ health }: { health: WANInterfaceHealth }) {
  const [showAdd, setShowAdd] = useState(false)
  const [type, setType] = useState<string>('ping')
  const [target, setTarget] = useState('')
  const [testScript, setTestScript] = useState('')
  const [respTime, setRespTime] = useState('')
  const [ttlLimit, setTtlLimit] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const nextId = String(health.tests.reduce((max, t) => Math.max(max, Number(t.id)), -1) + 1)

  function submit() {
    const ops = addWANHealthTestOps(health.interface, nextId, { type, target, testScript, respTime, ttlLimit })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setType('ping')
    setTarget('')
    setTestScript('')
    setRespTime('')
    setTtlLimit('')
    setShowAdd(false)
  }

  function queueRemove(testId: string) {
    const op = removeWANHealthTestOp(health.interface, testId)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="mt-3 border-t border-surface-border pt-3">
      <p className="mb-1 text-xs text-slate-500">Health tests</p>
      {health.tests.map((test) => (
        <div key={test.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            #{test.id} {test.type}
            {test.target && ` -> ${test.target}`}
          </span>
          <button onClick={() => queueRemove(test.id)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {health.tests.length === 0 && <p className="text-xs text-slate-500">No tests configured.</p>}

      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add test'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            {WAN_HEALTH_TEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            {...noExtensionInputProps}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="target address"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={testScript}
            onChange={(e) => setTestScript(e.target.value)}
            placeholder="user-defined test script"
            className={`font-mono ${inputClass}`}
          />
          <input
            {...noExtensionInputProps}
            value={respTime}
            onChange={(e) => setRespTime(e.target.value)}
            placeholder="resp-time (default 5)"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={ttlLimit}
            onChange={(e) => setTtlLimit(e.target.value)}
            placeholder="ttl-limit (default 1)"
            className={inputClass}
          />
          <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
            Add test
          </button>
        </div>
      )}
    </div>
  )
}
