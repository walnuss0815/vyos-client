import { useState } from 'react'
import { buttonClass, inputClass } from '../lib/formStyles'
import { noExtensionInputProps } from '../lib/inputProtection'
import type { ConfigOp } from '../lib/vyosApi'
import { usePendingChangesStore } from '../store/pendingChanges'

/**
 * Generic add/remove UI for any VyOS tagNode-keyed id+value pair list
 * (`<tag> <id> value <value>`) - e.g. container `environment`/`label`
 * entries, or a container's `sysctl parameter`. Mirrors ChipList.tsx's
 * "build ops inline, queue immediately by default" convention for
 * simple multi-entry leaves, extended to two fields (an id and a
 * value) instead of one.
 */
export default function KeyValuePairList({
  items,
  basePath,
  pathLabel,
  idPlaceholder,
  valuePlaceholder,
  onAdd,
  onRemove,
}: {
  items: { id: string; value: string }[]
  /** Path up to and including the tagNode name itself, e.g.
   * containerNamePath(name, 'environment') - the id and 'value' are
   * appended by this component. */
  basePath: string[]
  /** Human-readable dotted path for the pending-changes label. */
  pathLabel: string
  idPlaceholder?: string
  valuePlaceholder?: string
  /** Overrides what "Add" does, in place of the default "immediately
   * queue a real `set` op" - see ChipList.tsx's onAdd doc comment for
   * why (buffering a not-yet-created parent's nested entries locally
   * until its own submit, so an abandoned creation never leaves an
   * orphaned queued op behind). `items` must then be whatever local
   * state `onAdd`/`onRemove` write to. */
  onAdd?: (id: string, value: string) => void
  /** The mirror of onAdd, for Remove. */
  onRemove?: (id: string) => void
}) {
  const [newId, setNewId] = useState('')
  const [newValue, setNewValue] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const trimmedId = newId.trim()
  const taken = items.some((i) => i.id === trimmedId)
  const valid = trimmedId !== '' && !taken && newValue.trim() !== ''

  function queueAdd() {
    if (!valid) return
    if (onAdd) {
      onAdd(trimmedId, newValue.trim())
    } else {
      const op: ConfigOp = { op: 'set', path: [...basePath, trimmedId, 'value'], value: newValue.trim() }
      add({ op, label: `set ${pathLabel} ${trimmedId} value '${newValue.trim()}'` })
    }
    setNewId('')
    setNewValue('')
  }

  function queueRemove(id: string) {
    if (onRemove) {
      onRemove(id)
      return
    }
    const op: ConfigOp = { op: 'delete', path: [...basePath, id] }
    add({ op, label: `delete ${pathLabel} ${id}` })
  }

  return (
    <div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">
              {item.id} <span className="text-slate-500">= {item.value}</span>
            </span>
            <button
              onClick={() => queueRemove(item.id)}
              className="text-slate-500 hover:text-danger-500"
              aria-label={`Remove ${item.id}`}
            >
              Remove
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <input
          {...noExtensionInputProps}
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          placeholder={idPlaceholder ?? 'name'}
          className={inputClass}
        />
        <input
          {...noExtensionInputProps}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={valuePlaceholder ?? 'value'}
          className={inputClass}
        />
        <button onClick={queueAdd} disabled={!valid} className={`bg-accent-600 ${buttonClass}`}>
          Add
        </button>
      </div>
      {taken && <p className="mt-1 text-xs text-danger-500">This name is already used.</p>}
    </div>
  )
}
