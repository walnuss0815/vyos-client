import { useState } from 'react'
import ChipList from '../ChipList'
import { containerPortPath } from '../../lib/containerParse'
import { addPortOps, removePortOp } from '../../lib/containerNestedForm'
import { CONTAINER_PORT_PROTOCOLS, type ContainerPort } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** ContainerNestedSections.tsx's "Port mappings" section, extracted
 * into its own file for size (see that file's own doc comment for why
 * it's split this way). Also reused by ContainerCreateNestedSections
 * .tsx in draft mode (via onAdd/onRemove/onListenAddressesChange) -
 * see this component's own prop doc comments.
 *
 * A port's listen-addresses ChipList is only shown once the port
 * entry itself exists (same as the live/post-creation case) - in
 * draft mode that means it operates on the SAME draft port's
 * `listenAddresses` array via onListenAddressesChange, not a separate
 * top-level draft list of its own. */
export default function ContainerPortsSection({
  containerName,
  ports,
  onAdd,
  onRemove,
  onListenAddressesChange,
}: {
  containerName: string
  ports: ContainerPort[]
  /** Overrides what "Add port mapping" does, in place of the default
   * "immediately queue the real set ops" - see ChipList.tsx's onAdd
   * doc comment for the general rationale. `ports` must then be
   * whatever local state onAdd/onRemove write to. */
  onAdd?: (id: string, source: string, destination: string, protocol: string) => void
  /** The mirror of onAdd, for Remove. */
  onRemove?: (id: string) => void
  /** Overrides a port's listen-addresses ChipList to update draft
   * state instead of queuing real ops - receives the port's id and
   * its full new listen-addresses array. Only meaningful (and only
   * needs to be passed) alongside onAdd/onRemove. */
  onListenAddressesChange?: (portId: string, addresses: string[]) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const [protocol, setProtocol] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = ports.some((p) => p.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    if (onAdd) {
      onAdd(trimmedId, source, destination, protocol)
    } else {
      const ops = addPortOps(containerName, trimmedId, source, destination, protocol)
      for (const op of ops) {
        add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
      }
    }
    setId('')
    setSource('')
    setDestination('')
    setProtocol('')
    setShowAdd(false)
  }

  function remove(portId: string) {
    if (onRemove) {
      onRemove(portId)
      return
    }
    const op = removePortOp(containerName, portId)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      {ports.map((port) => (
        <div key={port.id} className="mb-2 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">
              {port.id}: {port.source ?? '?'} → {port.destination ?? '?'}
              {port.protocol && <span className="text-slate-500">/{port.protocol}</span>}
            </span>
            <button onClick={() => remove(port.id)} className="text-xs text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </div>
          <div className="mt-1">
            <ChipList
              values={port.listenAddresses}
              basePath={containerPortPath(containerName, port.id)}
              leaf="listen-address"
              pathLabel={`container name ${containerName} port ${port.id} listen-address`}
              placeholder="listen address (optional)"
              onAdd={
                onListenAddressesChange
                  ? (v) => onListenAddressesChange(port.id, [...port.listenAddresses, v])
                  : undefined
              }
              onRemove={
                onListenAddressesChange
                  ? (v) =>
                      onListenAddressesChange(
                        port.id,
                        port.listenAddresses.filter((a) => a !== v),
                      )
                  : undefined
              }
            />
          </div>
        </div>
      ))}
      {ports.length === 0 && <p className="text-xs text-slate-500">No port mappings.</p>}

      <button onClick={() => setShowAdd((v) => !v)} className="mt-1 text-xs text-accent-500 hover:text-accent-400">
        {showAdd ? 'Cancel' : '+ Add port mapping'}
      </button>
      {showAdd && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            {...noExtensionInputProps}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="name"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="source port"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="destination port"
            className={inputClass}
          />
          <select value={protocol} onChange={(e) => setProtocol(e.target.value)} className={inputClass}>
            <option value="">tcp (default)</option>
            {CONTAINER_PORT_PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button onClick={submit} disabled={!valid} className={`col-span-4 bg-accent-600 ${buttonClass}`}>
            Add port mapping
          </button>
          {taken && <p className="col-span-4 text-danger-500">This port name is already used.</p>}
        </div>
      )}
    </div>
  )
}
