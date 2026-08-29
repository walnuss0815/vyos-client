import { useState } from 'react'
import { addRedistributionOps, removeRedistributionOp } from '../../lib/ospfGlobalForm'
import {
  OSPFV3_REDISTRIBUTE_SOURCES,
  OSPF_REDISTRIBUTE_SOURCES,
  type OSPFProtocol,
  type OSPFRedistribution,
} from '../../lib/ospfTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

export default function OSPFRedistribution({
  protocol,
  redistributions,
}: {
  protocol: OSPFProtocol
  redistributions: OSPFRedistribution[]
}) {
  const sources = protocol === 'ospf' ? OSPF_REDISTRIBUTE_SOURCES : OSPFV3_REDISTRIBUTE_SOURCES
  const [source, setSource] = useState<string>(sources[0])
  const [metric, setMetric] = useState('')
  const [metricType, setMetricType] = useState<'' | '1' | '2'>('')
  const add = usePendingChangesStore((s) => s.add)

  const taken = redistributions.some((r) => r.source === source)

  function submit() {
    if (taken) return
    const ops = addRedistributionOps(protocol, source, metric, metricType)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setMetric('')
    setMetricType('')
  }

  function queueRemove(r: OSPFRedistribution) {
    const op = removeRedistributionOp(protocol, r.source)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-2 inline-flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
        Redistribution
        <InfoTooltip text="Imports routes learned via another protocol or source (e.g. directly-connected, static, BGP) into OSPF, so they get advertised as external routes to OSPF neighbors." />
      </h2>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Redistribution source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className={inputClass}
        >
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          {...noExtensionInputProps}
          value={metric}
          onChange={(e) => setMetric(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="metric (optional)"
          className={`w-32 ${inputClass}`}
        />
        <select
          aria-label="Redistribution metric type"
          value={metricType}
          onChange={(e) => setMetricType(e.target.value as '' | '1' | '2')}
          className={inputClass}
        >
          <option value="">metric-type (default: 2)</option>
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
        <button onClick={submit} disabled={taken} className={`bg-accent-600 ${buttonClass}`}>
          Add
        </button>
      </div>
      {taken && <p className="mb-2 text-xs text-danger-500">This source is already redistributed.</p>}
      <ul className="space-y-1">
        {redistributions.map((r) => (
          <li key={r.source} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              {r.source}
              {r.metric && <span className="text-slate-500"> metric {r.metric}</span>}
              {r.metricType && <span className="text-slate-500"> metric-type {r.metricType}</span>}
            </span>
            <button onClick={() => queueRemove(r)} className="text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </li>
        ))}
        {redistributions.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
    </div>
  )
}
