import { useState } from 'react'
import ChipList from '../ChipList'
import { containerNetworkAttachmentPath } from '../../lib/containerParse'
import { addNetworkAttachmentOps, removeNetworkAttachmentOp } from '../../lib/containerNestedForm'
import type { ContainerDefinition, ContainerNetwork } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** ContainerNestedSections.tsx's "Network attachments" section,
 * extracted into its own file for size (see that file's own doc
 * comment for why it's split this way). */
export default function ContainerNetworkAttachmentsSection({
  container,
  networks,
}: {
  container: ContainerDefinition
  networks: ContainerNetwork[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [networkName, setNetworkName] = useState('')
  const [mac, setMac] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const attached = container.networks.map((n) => n.networkName)
  const available = networks.map((n) => n.name).filter((n) => !attached.includes(n))
  const valid = networkName !== ''

  function submit() {
    if (!valid) return
    const ops = addNetworkAttachmentOps(container.name, networkName, mac)
    for (const op of ops) {
      add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
    }
    setNetworkName('')
    setMac('')
    setShowAdd(false)
  }

  return (
    <div>
      {container.networks.map((na) => (
        <div key={na.networkName} className="mb-2 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">
              {na.networkName}
              {na.mac && <span className="text-slate-500"> mac={na.mac}</span>}
            </span>
            <button
              onClick={() => {
                const op = removeNetworkAttachmentOp(container.name, na.networkName)
                add({ op, label: `delete ${op.path.join(' ')}` })
              }}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          </div>
          <div className="mt-1">
            <ChipList
              values={na.addresses}
              basePath={containerNetworkAttachmentPath(container.name, na.networkName)}
              leaf="address"
              pathLabel={`container name ${container.name} network ${na.networkName} address`}
              placeholder="192.0.2.5"
            />
          </div>
        </div>
      ))}
      {container.networks.length === 0 && <p className="text-xs text-slate-500">No networks attached.</p>}

      <div className="mt-1 flex items-center justify-between">
        <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-accent-500 hover:text-accent-400">
          {showAdd ? 'Cancel' : '+ Attach network'}
        </button>
      </div>
      {showAdd && (
        <div className="mt-2 flex items-center gap-2">
          <select value={networkName} onChange={(e) => setNetworkName(e.target.value)} className={inputClass}>
            <option value="">Select a network…</option>
            {available.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            {...noExtensionInputProps}
            value={mac}
            onChange={(e) => setMac(e.target.value)}
            placeholder="mac (optional, default auto)"
            className={inputClass}
          />
          <button onClick={submit} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
            Attach
          </button>
        </div>
      )}
    </div>
  )
}
