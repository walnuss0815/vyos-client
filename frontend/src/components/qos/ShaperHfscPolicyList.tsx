import { useState } from 'react'
import {
  blankHfscClassFormValues,
  blankShaperHfscPolicyFormValues,
  deleteHfscClassOp,
  deleteShaperHfscPolicyOp,
  hfscClassFormToOps,
  hfscClassToFormValues,
  hfscDefaultClassFormToOps,
  hfscDefaultClassToFormValues,
  shaperHfscClassPath,
  shaperHfscPolicyFormToOps,
  shaperHfscPolicyToFormValues,
  type HfscClassFormValues,
  type HfscCurveFormValues,
} from '../../lib/qosShaperHfscForm'
import type { QosHfscClass, QosShaperHfscPolicy } from '../../lib/qosTypes'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'
import QosMatchList from './QosMatchList'

/** `qos policy shaper-hfsc <name>` list - curve-based (linkshare/
 * realtime/upperlimit) bandwidth+latency guarantees, for when a plain
 * `shaper`'s guaranteed-rate model isn't precise enough (e.g. hard
 * real-time low-latency guarantees for VoIP). Notably undocumented on
 * docs.vyos.io - this app's field set is sourced directly from
 * vyos-1x's XML/conf-mode script. */
export default function ShaperHfscPolicyList({
  policies,
  availableMatchGroups,
}: {
  policies: QosShaperHfscPolicy[]
  availableMatchGroups: string[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  const existingNames = policies.map((p) => p.name)

  function queueDelete(name: string) {
    add({ op: deleteShaperHfscPolicyOp(name), label: `delete qos policy shaper-hfsc ${name}` })
  }

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Shaper HFSC
          <InfoTooltip text="Curve-based bandwidth+latency guarantees (linkshare/realtime/upperlimit) - use this instead of the plain shaper type when you need a hard low-latency guarantee, not just a bandwidth share." />
        </p>
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
              placeholder="VOICE-SHAPER"
              className={`font-mono ${inputClass}`}
            />
          </label>
          {newName.trim() !== '' && !existingNames.includes(newName.trim()) && (
            <button
              onClick={() => {
                const trimmed = newName.trim()
                const ops = shaperHfscPolicyFormToOps(trimmed, undefined, blankShaperHfscPolicyFormValues())
                for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
                setShowAdd(false)
                setEditing(trimmed)
              }}
              className={`bg-accent-600 ${buttonClass}`}
            >
              Add policy
            </button>
          )}
        </div>
      )}

      {policies.length === 0 && !showAdd && <p className="text-xs text-slate-500">No HFSC policies configured yet.</p>}

      <div className="space-y-3">
        {policies.map((policy) => (
          <div key={policy.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-white">
                {policy.name} <span className="text-xs text-slate-500">({policy.bandwidth})</span>
              </span>
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
            <p className="mt-1 text-xs text-slate-500">
              {policy.classes.length} class{policy.classes.length === 1 ? '' : 'es'}
            </p>

            {editing === policy.name && (
              <div className="mt-3 space-y-3 border-t border-surface-border pt-3">
                <HfscPolicyFields policy={policy} />
                <HfscClassList policy={policy} availableMatchGroups={availableMatchGroups} />
                <HfscDefaultClassPanel policy={policy} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function HfscPolicyFields({ policy }: { policy: QosShaperHfscPolicy }) {
  const add = usePendingChangesStore((s) => s.add)
  const before = shaperHfscPolicyToFormValues(policy)
  const [values, setValues] = useState(before)

  function submit() {
    const ops = shaperHfscPolicyFormToOps(policy.name, policy, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label className={labelClass}>
        Description
        <input
          {...noExtensionInputProps}
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Bandwidth
        <input
          {...noExtensionInputProps}
          value={values.bandwidth}
          onChange={(e) => setValues((v) => ({ ...v, bandwidth: e.target.value }))}
          placeholder="auto, a %, or e.g. 100mbit"
          className={inputClass}
        />
      </label>
      <div className="flex items-end">
        <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
          Save policy
        </button>
      </div>
    </div>
  )
}

function CurveFields({
  label,
  values,
  onChange,
}: {
  label: string
  values: HfscCurveFormValues
  onChange: (v: HfscCurveFormValues) => void
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase text-slate-500">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        <input
          {...noExtensionInputProps}
          value={values.m1}
          onChange={(e) => onChange({ ...values, m1: e.target.value })}
          placeholder="m1"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.d}
          onChange={(e) => onChange({ ...values, d: e.target.value })}
          placeholder="d (ms)"
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={values.m2}
          onChange={(e) => onChange({ ...values, m2: e.target.value })}
          placeholder="m2"
          className={inputClass}
        />
      </div>
    </div>
  )
}

function HfscClassList({ policy, availableMatchGroups }: { policy: QosShaperHfscPolicy; availableMatchGroups: string[] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingClass, setEditingClass] = useState<string | null>(null)
  const [newId, setNewId] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const existingIds = policy.classes.map((c) => c.id)

  function queueDelete(classId: string) {
    add({
      op: deleteHfscClassOp(policy.name, classId),
      label: `delete qos policy shaper-hfsc ${policy.name} class ${classId}`,
    })
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
            placeholder="class ID (1-4095)"
            className={inputClass}
          />
          <button
            onClick={() => {
              const trimmed = newId.trim()
              if (!trimmed || existingIds.includes(trimmed)) return
              const ops = hfscClassFormToOps(policy.name, trimmed, undefined, blankHfscClassFormValues())
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
            <span className="font-mono text-xs text-slate-300">#{cls.id}</span>
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
              <HfscClassFields policy={policy} cls={cls} />
              <QosMatchList
                basePath={shaperHfscClassPath(policy.name, cls.id)}
                matches={cls.matches}
                matchGroups={cls.matchGroups}
                availableMatchGroups={availableMatchGroups}
                pathLabel={`qos policy shaper-hfsc ${policy.name} class ${cls.id}`}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function HfscClassFields({ policy, cls }: { policy: QosShaperHfscPolicy; cls: QosHfscClass }) {
  const add = usePendingChangesStore((s) => s.add)
  const [values, setValues] = useState<HfscClassFormValues>(hfscClassToFormValues(cls))

  function submit() {
    const ops = hfscClassFormToOps(policy.name, cls.id, cls, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="space-y-2">
      <input
        {...noExtensionInputProps}
        value={values.description}
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        placeholder="description"
        className={inputClass}
      />
      <CurveFields label="Linkshare" values={values.linkshare} onChange={(v) => setValues((s) => ({ ...s, linkshare: v }))} />
      <CurveFields label="Realtime" values={values.realtime} onChange={(v) => setValues((s) => ({ ...s, realtime: v }))} />
      <CurveFields
        label="Upperlimit"
        values={values.upperlimit}
        onChange={(v) => setValues((s) => ({ ...s, upperlimit: v }))}
      />
      <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
        Save
      </button>
    </div>
  )
}

function HfscDefaultClassPanel({ policy }: { policy: QosShaperHfscPolicy }) {
  const add = usePendingChangesStore((s) => s.add)
  const before = hfscDefaultClassToFormValues(policy.defaultClass)
  const [values, setValues] = useState(before)

  function submit() {
    const ops = hfscDefaultClassFormToOps(policy.name, before, values)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Default class (unmatched traffic)</p>
      <CurveFields label="Linkshare" values={values.linkshare} onChange={(v) => setValues((s) => ({ ...s, linkshare: v }))} />
      <CurveFields label="Realtime" values={values.realtime} onChange={(v) => setValues((s) => ({ ...s, realtime: v }))} />
      <CurveFields
        label="Upperlimit"
        values={values.upperlimit}
        onChange={(v) => setValues((s) => ({ ...s, upperlimit: v }))}
      />
      <button onClick={submit} className={`bg-accent-600 ${buttonClass}`}>
        Save default
      </button>
    </div>
  )
}
