import { useState } from 'react'
import {
  addNetworkOp,
  addRedistributionOps,
  removeNetworkOp,
  removeRedistributionOp,
} from '../../lib/bgpGlobalForm'
import {
  BGP_REDISTRIBUTE_SOURCES_IPV4,
  BGP_REDISTRIBUTE_SOURCES_IPV6,
  type BGPNetworkAdvertisement,
  type BGPRedistribution,
} from '../../lib/bgpTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'
import InfoTooltip from '../InfoTooltip'

/** Network advertisement and redistribution both live under
 * `protocols bgp address-family <ipv4-unicast|ipv6-unicast>` and are
 * both simple keyed lists (a prefix, or a source protocol) with no
 * further diffable sub-form - unlike neighbors/peer-groups, so they
 * get one small add/remove component each instead of a full form,
 * same as StaticRouteCard.tsx's dhcp-interface ChipList. */
export default function BGPNetworksAndRedistribution({
  networks,
  redistributions,
}: {
  networks: BGPNetworkAdvertisement[]
  redistributions: BGPRedistribution[]
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <NetworksSection networks={networks} />
      <RedistributionSection redistributions={redistributions} />
    </div>
  )
}

function NetworksSection({ networks }: { networks: BGPNetworkAdvertisement[] }) {
  const [family, setFamily] = useState<'ipv4' | 'ipv6'>('ipv4')
  const [prefix, setPrefix] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedPrefix = prefix.trim()
  const taken = networks.some((n) => n.family === family && n.prefix === trimmedPrefix)
  const valid = trimmedPrefix !== '' && !taken

  function submit() {
    if (!valid) return
    const op = addNetworkOp(family, trimmedPrefix)
    add({ op, label: `set ${op.path.join(' ')}` })
    setPrefix('')
  }

  function queueRemove(n: BGPNetworkAdvertisement) {
    const op = removeNetworkOp(n.family, n.prefix)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-2 inline-flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
        Network advertisement
        <InfoTooltip text="Explicitly injects this prefix into BGP even if it isn't learned from another routing protocol - the prefix must already exist in the routing table (e.g. as a static route) or it won't be advertised." />
      </h2>
      <div className="mb-2 flex items-center gap-2">
        <select
          aria-label="Network family"
          value={family}
          onChange={(e) => setFamily(e.target.value as 'ipv4' | 'ipv6')}
          className={inputClass}
        >
          <option value="ipv4">IPv4</option>
          <option value="ipv6">IPv6</option>
        </select>
        <input
          {...noExtensionInputProps}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder={family === 'ipv6' ? '2001:db8::/32' : '198.51.100.0/24'}
          className={`flex-1 ${inputClass}`}
        />
        <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
          Add
        </button>
      </div>
      {taken && <p className="mb-2 text-xs text-danger-500">This network is already advertised.</p>}
      <ul className="space-y-1">
        {networks.map((n) => (
          <li key={`${n.family}-${n.prefix}`} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              <span className="mr-1 text-slate-500 uppercase">{n.family}</span>
              {n.prefix}
            </span>
            <button onClick={() => queueRemove(n)} className="text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </li>
        ))}
        {networks.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
    </div>
  )
}

function RedistributionSection({ redistributions }: { redistributions: BGPRedistribution[] }) {
  const [family, setFamily] = useState<'ipv4' | 'ipv6'>('ipv4')
  const [source, setSource] = useState<string>(BGP_REDISTRIBUTE_SOURCES_IPV4[0])
  const [metric, setMetric] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const sources = family === 'ipv4' ? BGP_REDISTRIBUTE_SOURCES_IPV4 : BGP_REDISTRIBUTE_SOURCES_IPV6
  const taken = redistributions.some((r) => r.family === family && r.source === source)

  function changeFamily(next: 'ipv4' | 'ipv6') {
    setFamily(next)
    const nextSources = next === 'ipv4' ? BGP_REDISTRIBUTE_SOURCES_IPV4 : BGP_REDISTRIBUTE_SOURCES_IPV6
    setSource((current) => (nextSources as readonly string[]).includes(current) ? current : nextSources[0])
  }

  function submit() {
    if (taken) return
    const ops = addRedistributionOps(family, source, metric)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setMetric('')
  }

  function queueRemove(r: BGPRedistribution) {
    const op = removeRedistributionOp(r.family, r.source)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-2 inline-flex items-center gap-1 text-sm font-medium uppercase tracking-wide text-slate-500">
        Redistribution
        <InfoTooltip text="Imports routes learned via another protocol (or source, like directly-connected/static) into BGP, so they get advertised to neighbors alongside natively-learned BGP routes." />
      </h2>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Redistribution family"
          value={family}
          onChange={(e) => changeFamily(e.target.value as 'ipv4' | 'ipv6')}
          className={inputClass}
        >
          <option value="ipv4">IPv4</option>
          <option value="ipv6">IPv6</option>
        </select>
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
        <button onClick={submit} disabled={taken} className={`bg-accent-600 ${buttonClass}`}>
          Add
        </button>
      </div>
      {taken && <p className="mb-2 text-xs text-danger-500">This source is already redistributed.</p>}
      <ul className="space-y-1">
        {redistributions.map((r) => (
          <li key={`${r.family}-${r.source}`} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              <span className="mr-1 text-slate-500 uppercase">{r.family}</span>
              {r.source}
              {r.metric && <span className="text-slate-500"> metric {r.metric}</span>}
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
