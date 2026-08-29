import { useState } from 'react'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { noExtensionInputProps } from '../../lib/inputProtection'
import type { ConfigOp } from '../../lib/vyosApi'
import { usePendingChangesStore } from '../../store/pendingChanges'

/**
 * Add/remove UI for a VyOS multi-valued `address` leaf (accepts a
 * static CIDR, or the literal `dhcp`/`dhcpv6`) - shared by every
 * interface type's own address list and their VLAN sub-interfaces'
 * address lists, since the leaf shape is identical everywhere it
 * appears. Each add/remove is queued immediately, matching the
 * existing "chip list" convention used throughout the Firewall UI
 * (e.g. a zone's member interfaces) - not batched behind a Save
 * button like the rest of an interface's fields.
 */
export default function AddressChips({
  addresses,
  basePath,
  pathLabel,
}: {
  addresses: string[]
  basePath: string[]
  /** Human-readable dotted path for the pending-changes label, e.g.
   * "interfaces ethernet eth0 address". */
  pathLabel: string
}) {
  const [newAddress, setNewAddress] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  function queueAdd(value: string) {
    if (!value) return
    const op: ConfigOp = { op: 'set', path: [...basePath, 'address'], value }
    add({ op, label: `set ${pathLabel} '${value}'` })
    setNewAddress('')
  }

  function queueRemove(value: string) {
    const op: ConfigOp = { op: 'delete', path: [...basePath, 'address'], value }
    add({ op, label: `delete ${pathLabel} '${value}'` })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {addresses.map((addr) => (
          <span
            key={addr}
            className="flex items-center gap-1 rounded bg-surface-800 px-2 py-0.5 font-mono text-xs text-slate-300"
          >
            {addr}
            <button
              onClick={() => queueRemove(addr)}
              className="text-slate-500 hover:text-danger-500"
              aria-label={`Remove address ${addr}`}
            >
              ✕
            </button>
          </span>
        ))}
        {addresses.length === 0 && <span className="text-xs text-slate-500">No addresses configured.</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          {...noExtensionInputProps}
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          placeholder="192.0.2.1/24"
          className={inputClass}
        />
        <button
          onClick={() => queueAdd(newAddress.trim())}
          disabled={!newAddress.trim()}
          className={`bg-accent-600 ${buttonClass}`}
        >
          Add
        </button>
        <button onClick={() => queueAdd('dhcp')} className={`bg-surface-700 ${buttonClass}`}>
          + DHCP
        </button>
        <button onClick={() => queueAdd('dhcpv6')} className={`bg-surface-700 ${buttonClass}`}>
          + DHCPv6
        </button>
      </div>
    </div>
  )
}
