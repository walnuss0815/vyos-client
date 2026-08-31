import { useState } from 'react'
import ChipList from '../ChipList'
import { containerNetworkAttachmentPath } from '../../lib/containerParse'
import { addNetworkAttachmentOps, removeNetworkAttachmentOp } from '../../lib/containerNestedForm'
import type { ContainerNetwork, ContainerNetworkAttachment } from '../../lib/containerTypes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import { usePendingChangesStore } from '../../store/pendingChanges'

/** ContainerNestedSections.tsx's "Network attachments" section,
 * extracted into its own file for size (see that file's own doc
 * comment for why it's split this way). Also reused by
 * ContainerCreateNestedSections.tsx in draft mode (via onAdd/onRemove
 * /onAddressesChange) - see this component's own prop doc comments.
 *
 * `networks` (the list of already-existing `container network <name>`
 * definitions to attach to) is always real/fetched data, in both
 * modes - attaching a not-yet-created container to an existing
 * network has no chicken-and-egg problem, unlike this container's own
 * nested resources. */
export default function ContainerNetworkAttachmentsSection({
  containerName,
  attachments,
  networks,
  onAdd,
  onRemove,
  onAddressesChange,
}: {
  containerName: string
  attachments: ContainerNetworkAttachment[]
  networks: ContainerNetwork[]
  /** Overrides what "Attach" does, in place of the default
   * "immediately queue the real set ops" - see ChipList.tsx's onAdd
   * doc comment for the general rationale. `attachments` must then be
   * whatever local state onAdd/onRemove write to. */
  onAdd?: (networkName: string, mac: string) => void
  /** The mirror of onAdd, for Remove. */
  onRemove?: (networkName: string) => void
  /** Overrides an attachment's addresses ChipList to update draft
   * state instead of queuing real ops - receives the attachment's
   * network name and its full new addresses array. Only meaningful
   * (and only needs to be passed) alongside onAdd/onRemove. */
  onAddressesChange?: (networkName: string, addresses: string[]) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [networkName, setNetworkName] = useState('')
  const [mac, setMac] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const attached = attachments.map((n) => n.networkName)
  const available = networks.map((n) => n.name).filter((n) => !attached.includes(n))
  const valid = networkName !== ''

  function submit() {
    if (!valid) return
    if (onAdd) {
      onAdd(networkName, mac)
    } else {
      const ops = addNetworkAttachmentOps(containerName, networkName, mac)
      for (const op of ops) {
        add({ op, label: `${op.op} ${op.path.join(' ')}${op.value ? ` '${op.value}'` : ''}` })
      }
    }
    setNetworkName('')
    setMac('')
    setShowAdd(false)
  }

  function remove(netName: string) {
    if (onRemove) {
      onRemove(netName)
      return
    }
    const op = removeNetworkAttachmentOp(containerName, netName)
    add({ op, label: `delete ${op.path.join(' ')}` })
  }

  return (
    <div>
      {attachments.map((na) => (
        <div key={na.networkName} className="mb-2 rounded border border-surface-border p-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-slate-300">
              {na.networkName}
              {na.mac && <span className="text-slate-500"> mac={na.mac}</span>}
            </span>
            <button onClick={() => remove(na.networkName)} className="text-xs text-slate-500 hover:text-danger-500">
              Remove
            </button>
          </div>
          <div className="mt-1">
            <ChipList
              values={na.addresses}
              basePath={containerNetworkAttachmentPath(containerName, na.networkName)}
              leaf="address"
              pathLabel={`container name ${containerName} network ${na.networkName} address`}
              placeholder="192.0.2.5"
              onAdd={
                onAddressesChange ? (v) => onAddressesChange(na.networkName, [...na.addresses, v]) : undefined
              }
              onRemove={
                onAddressesChange
                  ? (v) => onAddressesChange(na.networkName, na.addresses.filter((a) => a !== v))
                  : undefined
              }
            />
          </div>
        </div>
      ))}
      {attachments.length === 0 && <p className="text-xs text-slate-500">No networks attached.</p>}

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
