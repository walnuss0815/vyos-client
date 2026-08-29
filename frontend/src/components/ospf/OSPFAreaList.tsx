import { useState } from 'react'
import OSPFAreaForm from './OSPFAreaForm'
import ChipList from '../ChipList'
import { addAreaRangeOps, deleteAreaOp, removeAreaRangeOp } from '../../lib/ospfAreaForm'
import { ospfAreaPath } from '../../lib/ospfParse'
import type { OSPFArea, OSPFProtocol } from '../../lib/ospfTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

interface OSPFAreaListProps {
  protocol: OSPFProtocol
  areas: OSPFArea[]
  isLoading: boolean
}

/** List of OSPF(v3) areas - mirrors BGPPeerList.tsx's list-plus-
 * toggleable-forms structure, with each area's networks (OSPFv2 only)
 * and ranges nested underneath, mirroring StaticRouteCard.tsx's
 * nested-sections pattern. */
export default function OSPFAreaList({ protocol, areas, isLoading }: OSPFAreaListProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)

  function queueDelete(areaId: string) {
    const op = deleteAreaOp(protocol, areaId)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  const editing = editingId ? areas.find((a) => a.id === editingId) : undefined

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Areas ({areas.length})
        </h2>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setEditingId(null)
          }}
          className={`bg-accent-600 ${buttonClass}`}
        >
          {showCreate ? 'Cancel' : '+ New area'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <OSPFAreaForm
            protocol={protocol}
            existingIds={areas.map((a) => a.id)}
            onDone={() => setShowCreate(false)}
          />
        </div>
      )}

      {editing && (
        <div className="mb-3">
          <OSPFAreaForm
            protocol={protocol}
            area={editing}
            existingIds={areas.map((a) => a.id)}
            onDone={() => setEditingId(null)}
          />
        </div>
      )}

      <div className="space-y-3">
        {areas.map((area) => (
          <div key={area.id} className="rounded-xl border border-surface-border bg-surface-900 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-mono text-sm font-medium text-white">Area {area.id}</h3>
                  {area.areaType && (
                    <span className="rounded bg-accent-600/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-accent-500">
                      {area.areaType}
                      {area.noSummary ? ' (totally stubby)' : ''}
                    </span>
                  )}
                  {area.authentication && (
                    <span className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                      auth: {area.authentication}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditingId(area.id)
                    setShowCreate(false)
                  }}
                  className="text-accent-500 hover:text-accent-400"
                >
                  Edit
                </button>
                <button onClick={() => queueDelete(area.id)} className="text-slate-500 hover:text-danger-500">
                  Delete
                </button>
              </div>
            </div>

            {protocol === 'ospf' && (
              <div className="mt-3">
                <p className="mb-1 text-xs text-slate-500">Networks (enable OSPF on matching interfaces)</p>
                <ChipList
                  values={area.networks}
                  basePath={ospfAreaPath(protocol, area.id)}
                  leaf="network"
                  pathLabel={`protocols ${protocol} area ${area.id} network`}
                  placeholder="192.0.2.0/24"
                />
              </div>
            )}

            <RangesSection protocol={protocol} area={area} />
          </div>
        ))}
        {!isLoading && areas.length === 0 && <p className="text-xs text-slate-500">No areas configured yet.</p>}
      </div>
    </div>
  )
}

function RangesSection({ protocol, area }: { protocol: OSPFProtocol; area: OSPFArea }) {
  const [showAdd, setShowAdd] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [notAdvertise, setNotAdvertise] = useState(false)
  const [cost, setCost] = useState('')
  const [substitute, setSubstitute] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedPrefix = prefix.trim()
  const taken = area.ranges.some((r) => r.prefix === trimmedPrefix)
  const valid = trimmedPrefix !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addAreaRangeOps(protocol, area.id, trimmedPrefix, {
      notAdvertise,
      cost,
      substitute,
    })
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setPrefix('')
    setNotAdvertise(false)
    setCost('')
    setSubstitute('')
    setShowAdd(false)
  }

  function queueRemove(rangePrefix: string) {
    const op = removeAreaRangeOp(protocol, area.id, rangePrefix)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs text-slate-500">
          Summarized ranges
          <InfoTooltip text="Advertises one aggregate prefix into other areas instead of every individual network within this range - reduces the routing table size elsewhere. cost overrides the auto-computed advertised cost; substitute advertises a different prefix in place of the real one." />
        </p>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-xs text-accent-500 hover:text-accent-400"
        >
          {showAdd ? 'Cancel' : '+ Add range'}
        </button>
      </div>

      {showAdd && (
        <div className="my-2 space-y-2 rounded border border-surface-border p-2">
          <div className="flex items-center gap-2">
            <input
              {...noExtensionInputProps}
              autoFocus
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder={protocol === 'ospfv3' ? '2001:db8::/32' : '192.0.2.0/24'}
              className={`flex-1 ${inputClass}`}
            />
            <label className="flex items-center gap-1 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={notAdvertise}
                onChange={(e) => setNotAdvertise(e.target.checked)}
                className="accent-accent-500"
              />
              not-advertise
              <InfoTooltip text="Suppresses this range from being advertised into other areas at all, instead of summarizing it - useful for hiding internal-only subnets entirely." />
            </label>
          </div>
          {protocol === 'ospf' && (
            <div className="flex items-center gap-2">
              <input
                {...noExtensionInputProps}
                value={cost}
                onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="cost (optional)"
                className={`w-32 ${inputClass}`}
              />
              <input
                {...noExtensionInputProps}
                value={substitute}
                onChange={(e) => setSubstitute(e.target.value)}
                placeholder="substitute prefix (optional)"
                className={`flex-1 ${inputClass}`}
              />
            </div>
          )}
          {taken && <p className="text-danger-500">This range is already configured.</p>}
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add range
          </button>
        </div>
      )}

      <ul className="mt-1 space-y-1">
        {area.ranges.map((range) => (
          <li key={range.prefix} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              {range.prefix}
              {range.notAdvertise && <span className="text-slate-500"> (not advertised)</span>}
              {range.cost && <span className="text-slate-500"> cost {range.cost}</span>}
              {range.substitute && <span className="text-slate-500"> substitute {range.substitute}</span>}
            </span>
            <button
              onClick={() => queueRemove(range.prefix)}
              className="text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </li>
        ))}
        {area.ranges.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
    </div>
  )
}
