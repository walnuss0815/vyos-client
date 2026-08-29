import { useState } from 'react'
import ChipList from '../ChipList'
import { containerPortPath } from '../../lib/containerParse'
import { addPortOps, removePortOp } from '../../lib/containerNestedForm'
import { CONTAINER_PORT_PROTOCOLS, type ContainerDefinition } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** ContainerNestedSections.tsx's "Port mappings" section, extracted
 * into its own file for size (see that file's own doc comment for why
 * it's split this way). */
export default function ContainerPortsSection({ container }: { container: ContainerDefinition }) {
  const [showAdd, setShowAdd] = useState(false)
  const [id, setId] = useState('')
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const [protocol, setProtocol] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = id.trim()
  const taken = container.ports.some((p) => p.id === trimmedId)
  const valid = trimmedId !== '' && !taken

  function submit() {
    if (!valid) return
    const ops = addPortOps(container.name, trimmedId, source, destination, protocol)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setId('')
    setSource('')
    setDestination('')
    setProtocol('')
    setShowAdd(false)
  }

  return (
    <div>
      {container.ports.map((port) => (
        <div key={port.id} className="mb-2 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">
              {port.id}: {port.source ?? '?'} → {port.destination ?? '?'}
              {port.protocol && <span className="text-slate-500">/{port.protocol}</span>}
            </span>
            <button
              onClick={() => {
                const op = removePortOp(container.name, port.id)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
          <div className="mt-1">
            <ChipList
              values={port.listenAddresses}
              basePath={containerPortPath(container.name, port.id)}
              leaf="listen-address"
              pathLabel={`container name ${container.name} port ${port.id} listen-address`}
              placeholder="listen address (optional)"
            />
          </div>
        </div>
      ))}
      {container.ports.length === 0 && <p className="text-xs text-slate-500">No port mappings.</p>}

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
