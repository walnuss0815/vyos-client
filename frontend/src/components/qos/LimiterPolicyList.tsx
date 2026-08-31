import { useState } from 'react'
import {
  blankLimiterClassFormValues,
  deleteLimiterClassOp,
  deleteLimiterPolicyOp,
  limiterClassFormToOps,
  limiterClassPath,
  limiterClassToFormValues,
  limiterDefaultClassFormToOps,
  limiterDefaultClassToFormValues,
  limiterPolicyFormToOps,
  type LimiterClassFormValues,
  type LimiterDefaultClassFormValues,
} from '../../lib/qosLimiterForm'
import type { QosLimiterClass, QosLimiterPolicy } from '../../lib/qosTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import QosMatchList from './QosMatchList'

/** `qos policy limiter <name>` list - the only ingress-capable policy
 * type (VyOS enforces this at commit time), used for inbound rate
 * policing (accept/drop/reclassify, not true delay-based shaping). */
export default function LimiterPolicyList({
  policies,
  availableMatchGroups,
}: {
  policies: QosLimiterPolicy[]
  availableMatchGroups: string[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [firstClassId, setFirstClassId] = useState('')
  const [firstClassBandwidth, setFirstClassBandwidth] = useState('')
  const [defaultBandwidth, setDefaultBandwidth] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = policies.map((p) => p.name)

  function queueDelete(name: string) {
    add({ op: deleteLimiterPolicyOp(name), label: `delete qos policy limiter ${name}` })
  }

  function addPolicy() {
    const trimmed = newName.trim()
    const ops = limiterPolicyFormToOps(trimmed, undefined, { description: '' })
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}` })
    // A policy's classes and default class used to only be
    // configurable AFTER the policy already existed -
    // LimiterClassList/LimiterDefaultClassPanel only ever operate on
    // an already-fetched policy. Queuing a first class and/or the
    // default class's bandwidth here, in the same commit as the
    // policy itself, avoids a detour through commit+refetch.
    const trimmedClassId = firstClassId.trim()
    if (trimmedClassId) {
      const classOps = limiterClassFormToOps(trimmed, trimmedClassId, undefined, {
        ...blankLimiterClassFormValues(),
        bandwidth: firstClassBandwidth.trim(),
      })
      for (const op of classOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    if (defaultBandwidth.trim()) {
      const before: LimiterDefaultClassFormValues = {
        bandwidth: '',
        burst: '15k',
        mtu: '',
        policeExceed: 'drop',
        policeNotExceed: 'ok',
      }
      const defaultOps = limiterDefaultClassFormToOps(trimmed, before, { ...before, bandwidth: defaultBandwidth.trim() })
      for (const op of defaultOps) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setShowAdd(false)
    setEditing(trimmed)
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Limiter (ingress policing)</p>
        <button
          onClick={() => {
            setShowAdd((v) => !v)
            setEditing(null)
            setNewName('')
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showAdd ? 'Cancel' : '+ Add policy'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 rounded-xl border border-surface-border bg-surface-900 p-4">
          <label className={`${labelClass} mb-2`}>
            Name
            <input
              {...noExtensionInputProps}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="IN-LIMIT"
              className={`font-mono ${inputClass}`}
            />
          </label>
          {newName.trim() !== '' && !existingNames.includes(newName.trim()) && (
            <>
              <div className="mb-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">First class (optional)</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    {...noExtensionInputProps}
                    value={firstClassId}
                    onChange={(e) => setFirstClassId(e.target.value)}
                    placeholder="class ID (1-4090)"
                    className={inputClass}
                  />
                  <input
                    {...noExtensionInputProps}
                    value={firstClassBandwidth}
                    onChange={(e) => setFirstClassBandwidth(e.target.value)}
                    placeholder="bandwidth"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mb-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Default class (unmatched traffic, optional)
                </p>
                <input
                  {...noExtensionInputProps}
                  value={defaultBandwidth}
                  onChange={(e) => setDefaultBandwidth(e.target.value)}
                  placeholder="bandwidth"
                  className={inputClass}
                />
              </div>
              <button onClick={addPolicy} className={`bg-accent-600 ${buttonClass}`}>
                Add policy
              </button>
            </>
          )}
        </div>
      )}

      {policies.length === 0 && !showAdd && <p className="text-xs text-slate-500">No limiter policies configured yet.</p>}

      <div className="space-y-3">
        {policies.map((policy) => (
          <div key={policy.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-white">{policy.name}</span>
              <div>
                <button
                  onClick={() => setEditing(editing === policy.name ? null : policy.name)}
                  className="text-xs text-accent-500 hover:text-accent-400"
                >
                  {editing === policy.name ? 'Close' : 'Manage'}
                </button>{' '}
                <button onClick={() => queueDelete(policy.name)} className="ml-2 text-xs text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>
            {policy.description && <p className="text-xs text-slate-400">{policy.description}</p>}
            <p className="mt-1 text-xs text-slate-500">
              {policy.classes.length} class{policy.classes.length === 1 ? '' : 'es'}
            </p>

            {editing === policy.name && (
              <div className="mt-3 space-y-3 border-t border-surface-border pt-3">
                <LimiterClassList policy={policy} availableMatchGroups={availableMatchGroups} />
                <LimiterDefaultClassPanel policy={policy} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function LimiterClassList({
  policy,
  availableMatchGroups,
}: {
  policy: QosLimiterPolicy
  availableMatchGroups: string[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingClass, setEditingClass] = useState<string | null>(null)
  const [newId, setNewId] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const existingIds = policy.classes.map((c) => c.id)

  function queueDelete(classId: string) {
    add({ op: deleteLimiterClassOp(policy.name, classId), label: `delete qos policy limiter ${policy.name} class ${classId}` })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500">Classes</p>
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add class'}
        </button>
      </div>
      {showAdd && (
        <div className="mb-2 flex items-center gap-2">
          <input
            {...noExtensionInputProps}
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="class ID (1-4090)"
            className={inputClass}
          />
          <button
            onClick={() => {
              const trimmed = newId.trim()
              if (!trimmed || existingIds.includes(trimmed)) return
              const ops = limiterClassFormToOps(policy.name, trimmed, undefined, blankLimiterClassFormValues())
              for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}` })
              setNewId('')
              setShowAdd(false)
              setEditingClass(trimmed)
            }}
            disabled={!newId.trim() || existingIds.includes(newId.trim())}
            className={`bg-accent-600 ${buttonClass}`}
          >
            Add
          </button>
        </div>
      )}
      {policy.classes.length === 0 && <p className="text-xs text-slate-500">No classes yet.</p>}
      {policy.classes.map((cls) => (
        <div key={cls.id} className="mb-2 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">
              #{cls.id} {cls.bandwidth ?? '(no bandwidth)'}
            </span>
            <div>
              <button
                onClick={() => setEditingClass(editingClass === cls.id ? null : cls.id)}
                className="text-xs text-accent-500 hover:text-accent-400"
              >
                {editingClass === cls.id ? 'Close' : 'Edit'}
              </button>{' '}
              <button onClick={() => queueDelete(cls.id)} className="ml-2 text-xs text-slate-500 hover:text-danger-500">
                Remove
              </button>
            </div>
          </div>
          {editingClass === cls.id && (
            <div className="mt-2 space-y-2">
              <LimiterClassFields policy={policy} cls={cls} />
              <QosMatchList
                basePath={limiterClassPath(policy.name, cls.id)}
                matches={cls.matches}
                matchGroups={cls.matchGroups}
                availableMatchGroups={availableMatchGroups}
                pathLabel={`qos policy limiter ${policy.name} class ${cls.id}`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function LimiterClassFields({ policy, cls }: { policy: QosLimiterPolicy; cls: QosLimiterClass }) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<LimiterClassFormValues>(limiterClassToFormValues(cls))

  function update<K extends keyof LimiterClassFormValues>(key: K, value: LimiterClassFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = limiterClassFormToOps(policy.name, cls.id, cls, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          {...noExtensionInputProps}
          value={values.bandwidth}
          onChange={(e) => update('bandwidth', e.target.value)}
          placeholder="bandwidth"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.burst}
          onChange={(e) => update('burst', e.target.value)}
          placeholder="burst"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.mtu}
          onChange={(e) => update('mtu', e.target.value)}
          placeholder="MTU"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.priority}
          onChange={(e) => update('priority', e.target.value)}
          placeholder="priority (0-20)"
          className={inputClass}
        />
        <select value={values.policeExceed} onChange={(e) => update('policeExceed', e.target.value)} className={inputClass}>
          <option value="drop">exceed: drop</option>
          <option value="continue">exceed: continue</option>
          <option value="ok">exceed: ok</option>
          <option value="reclassify">exceed: reclassify</option>
          <option value="pipe">exceed: pipe</option>
        </select>
        <select
          value={values.policeNotExceed}
          onChange={(e) => update('policeNotExceed', e.target.value)}
          className={inputClass}
        >
          <option value="ok">not-exceed: ok</option>
          <option value="continue">not-exceed: continue</option>
          <option value="drop">not-exceed: drop</option>
          <option value="reclassify">not-exceed: reclassify</option>
          <option value="pipe">not-exceed: pipe</option>
        </select>
      </div>
      <button onClick={submit} className={`mt-2 bg-accent-600 ${buttonClass}`}>
        Save
      </button>
    </div>
  )
}

function LimiterDefaultClassPanel({ policy }: { policy: QosLimiterPolicy }) {
  const add = usePendingChangesStore((s) => s.add)
  const before = limiterDefaultClassToFormValues(policy.defaultClass)
  const [values, setValues] = useState(before)

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    const ops = limiterDefaultClassFormToOps(policy.name, before, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Default class (unmatched traffic)</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          {...noExtensionInputProps}
          value={values.bandwidth}
          onChange={(e) => update('bandwidth', e.target.value)}
          placeholder="bandwidth"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.burst}
          onChange={(e) => update('burst', e.target.value)}
          placeholder="burst"
          className={inputClass}
        />
        <select value={values.policeExceed} onChange={(e) => update('policeExceed', e.target.value)} className={inputClass}>
          <option value="drop">exceed: drop</option>
          <option value="continue">exceed: continue</option>
          <option value="ok">exceed: ok</option>
          <option value="reclassify">exceed: reclassify</option>
          <option value="pipe">exceed: pipe</option>
        </select>
        <select
          value={values.policeNotExceed}
          onChange={(e) => update('policeNotExceed', e.target.value)}
          className={inputClass}
        >
          <option value="ok">not-exceed: ok</option>
          <option value="continue">not-exceed: continue</option>
          <option value="drop">not-exceed: drop</option>
          <option value="reclassify">not-exceed: reclassify</option>
          <option value="pipe">not-exceed: pipe</option>
        </select>
      </div>
      <button onClick={submit} className={`mt-2 bg-accent-600 ${buttonClass}`}>
        Save default
      </button>
    </div>
  )
}
