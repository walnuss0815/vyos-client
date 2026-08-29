import { useState } from 'react'
import {
  addQosMatchGroupRefOp,
  addQosMatchOps,
  blankQosMatchOptions,
  removeQosMatchGroupRefOp,
  removeQosMatchOp,
  type QosMatchOptions,
} from '../../lib/qosMatchForm'
import type { QosMatch } from '../../lib/qosTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

function summarizeMatch(match: QosMatch): string {
  const parts: string[] = []
  if (match.ipProtocol) parts.push(match.ipProtocol)
  if (match.ipv6Protocol) parts.push(match.ipv6Protocol)
  if (match.ipSourceAddress) parts.push(`src:${match.ipSourceAddress}`)
  if (match.ipv6SourceAddress) parts.push(`src:${match.ipv6SourceAddress}`)
  if (match.ipSourcePort) parts.push(`sport:${match.ipSourcePort}`)
  if (match.ipv6SourcePort) parts.push(`sport:${match.ipv6SourcePort}`)
  if (match.ipDestinationAddress) parts.push(`dst:${match.ipDestinationAddress}`)
  if (match.ipv6DestinationAddress) parts.push(`dst:${match.ipv6DestinationAddress}`)
  if (match.ipDestinationPort) parts.push(`dport:${match.ipDestinationPort}`)
  if (match.ipv6DestinationPort) parts.push(`dport:${match.ipv6DestinationPort}`)
  if (match.ipDscp) parts.push(`dscp:${match.ipDscp}`)
  if (match.ipv6Dscp) parts.push(`dscp:${match.ipv6Dscp}`)
  if (match.interface) parts.push(`if:${match.interface}`)
  if (match.mark !== undefined) parts.push(`mark:${match.mark}`)
  if (match.vif !== undefined) parts.push(`vif:${match.vif}`)
  if (match.etherSource || match.etherDestination) parts.push('ether')
  return parts.length > 0 ? parts.join(' ') : 'any'
}

/** `match <id>` list plus `match-group <name>` references, shared by
 * every classful policy type's class/default-class and by `qos
 * traffic-match-group`'s own match list - see qosTypes.ts's QosMatch
 * doc comment for the practical field subset this app's own "add a
 * match" form exposes (full ether/TCP-flags/max-length matching is
 * still parsed/displayed, just not offered when creating a *new*
 * match here). */
export default function QosMatchList({
  basePath,
  matches,
  matchGroups,
  availableMatchGroups,
  pathLabel,
}: {
  basePath: string[]
  matches: QosMatch[]
  matchGroups: string[]
  availableMatchGroups: string[]
  pathLabel: string
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [matchId, setMatchId] = useState('')
  const [options, setOptions] = useState<QosMatchOptions>(blankQosMatchOptions())
  const [newMatchGroup, setNewMatchGroup] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = matchId.trim()
  const taken = matches.some((m) => m.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function update<K extends keyof QosMatchOptions>(key: K, value: QosMatchOptions[K]) {
    setOptions((v) => ({ ...v, [key]: value }))
  }

  function submit() {
    if (!valid) return
    const ops = addQosMatchOps(basePath, trimmedId, options)
    for (const op of ops) add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    setMatchId('')
    setOptions(blankQosMatchOptions())
    setShowAdd(false)
  }

  function queueRemove(id: string) {
    const op = removeQosMatchOp(basePath, id)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  function addMatchGroupRef() {
    const trimmed = newMatchGroup.trim()
    if (!trimmed || matchGroups.includes(trimmed)) return
    const op = addQosMatchGroupRefOp(basePath, trimmed)
    add({ op, label: `set ${pathLabel} match-group '${trimmed}'` })
    setNewMatchGroup('')
  }

  function removeMatchGroupRef(name: string) {
    const op = removeQosMatchGroupRefOp(basePath, name)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">Match rules</p>
      {matches.map((match) => (
        <div key={match.id} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">
            {match.id}: {summarizeMatch(match)}
          </span>
          <button onClick={() => queueRemove(match.id)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {matchGroups.map((name) => (
        <div key={name} className="mb-1 flex items-center justify-between rounded border border-surface-border p-2">
          <span className="font-mono text-xs text-slate-300">group: {name}</span>
          <button onClick={() => removeMatchGroupRef(name)} className="text-xs text-slate-500 hover:text-danger-500">
            Remove
          </button>
        </div>
      ))}
      {matches.length === 0 && matchGroups.length === 0 && (
        <p className="text-xs text-slate-500">No match rules - this class/policy applies to everything else.</p>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Add match'}
        </button>
        {availableMatchGroups.length > 0 && (
          <>
            <select value={newMatchGroup} onChange={(e) => setNewMatchGroup(e.target.value)} className={inputClass}>
              <option value="">reference a match group…</option>
              {availableMatchGroups
                .filter((g) => !matchGroups.includes(g))
                .map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
            </select>
            <button onClick={addMatchGroupRef} disabled={!newMatchGroup} className={`bg-accent-600 ${buttonClass}`}>
              Add
            </button>
          </>
        )}
      </div>

      {showAdd && (
        <div className="mt-2 space-y-2">
          <input
            {...noExtensionInputProps}
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            placeholder="match name"
            className={`font-mono ${inputClass}`}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <input
              {...noExtensionInputProps}
              value={options.ipSourceAddress}
              onChange={(e) => update('ipSourceAddress', e.target.value)}
              placeholder="source address (v4)"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={options.ipSourcePort}
              onChange={(e) => update('ipSourcePort', e.target.value)}
              placeholder="source port"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={options.ipProtocol}
              onChange={(e) => update('ipProtocol', e.target.value)}
              placeholder="protocol"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={options.ipDestinationAddress}
              onChange={(e) => update('ipDestinationAddress', e.target.value)}
              placeholder="destination address (v4)"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={options.ipDestinationPort}
              onChange={(e) => update('ipDestinationPort', e.target.value)}
              placeholder="destination port"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={options.ipDscp}
              onChange={(e) => update('ipDscp', e.target.value)}
              placeholder="DSCP"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={options.ipv6SourceAddress}
              onChange={(e) => update('ipv6SourceAddress', e.target.value)}
              placeholder="source address (v6)"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={options.ipv6DestinationAddress}
              onChange={(e) => update('ipv6DestinationAddress', e.target.value)}
              placeholder="destination address (v6)"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={options.interfaceName}
              onChange={(e) => update('interfaceName', e.target.value)}
              placeholder="ingress interface"
              className={`font-mono ${inputClass}`}
            />
            <input
              {...noExtensionInputProps}
              value={options.mark}
              onChange={(e) => update('mark', e.target.value)}
              placeholder="fwmark"
              className={inputClass}
            />
            <input
              {...noExtensionInputProps}
              value={options.vif}
              onChange={(e) => update('vif', e.target.value)}
              placeholder="VLAN tag (vif)"
              className={inputClass}
            />
          </div>
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Add match
          </button>
          {taken && <p className="text-xs text-danger-500">This match name is already used.</p>}
        </div>
      )}
    </div>
  )
}
