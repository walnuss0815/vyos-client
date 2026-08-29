import { useState } from 'react'
import { buttonClass, inputClass } from '../lib/formStyles'
import { noExtensionInputProps } from '../lib/inputProtection'
import type { ConfigOp } from '../lib/vyosApi'
import { usePendingChangesStore } from '../store/pendingChanges'

/**
 * Generic add/remove UI for any VyOS multi-valued leaf - e.g. a DHCP
 * shared network/subnet's `option name-server`/`ntp-server`/
 * `domain-search`, or a subnet's `exclude` list. Each add/remove is
 * queued immediately, matching the same convention as
 * components/interfaces/AddressChips.tsx (which is deliberately kept
 * separate rather than generalized into this component, since it also
 * has IP-addressing-specific dhcp/dhcpv6 quick-add buttons this
 * generic version doesn't need).
 */
export default function ChipList({
  values,
  basePath,
  leaf,
  pathLabel,
  placeholder,
}: {
  values: string[]
  basePath: string[]
  /** The multi-valued leaf name to append to basePath, e.g.
   * "name-server" or "exclude". */
  leaf: string
  /** Human-readable dotted path for the pending-changes label. */
  pathLabel: string
  placeholder?: string
}) {
  const [newValue, setNewValue] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedValue = newValue.trim()
  const taken = trimmedValue !== '' && values.includes(trimmedValue)

  function queueAdd() {
    if (!trimmedValue || taken) return
    const op: ConfigOp = { op: 'set', path: [...basePath, leaf], value: trimmedValue }
    add({ op, label: `set ${pathLabel} '${trimmedValue}'` })
    setNewValue('')
  }

  function queueRemove(value: string) {
    const op: ConfigOp = { op: 'delete', path: [...basePath, leaf], value }
    add({ op, label: `delete ${pathLabel} '${value}'` })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="flex items-center gap-1 rounded bg-surface-800 px-2 py-0.5 font-mono text-xs text-slate-300"
          >
            {value}
            <button
              onClick={() => queueRemove(value)}
              className="text-slate-500 hover:text-danger-500"
              aria-label={`Remove ${value}`}
            >
              ✕
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-slate-500">None configured.</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          {...noExtensionInputProps}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
        <button onClick={queueAdd} disabled={!trimmedValue || taken} className={`bg-accent-600 ${buttonClass}`}>
          Add
        </button>
      </div>
      {taken && <p className="mt-1 text-xs text-danger-500">This value is already added.</p>}
    </div>
  )
}
