import { useState } from 'react'
import { buttonClass, inputClass } from '../lib/formStyles'
import { noExtensionInputProps } from '../lib/inputProtection'
import { ApiError } from '../lib/api'
import { MASK_PLACEHOLDER, isMaskedPath } from '../lib/masking'
import type { ConfigOp } from '../lib/vyosApi'
import { revealValue } from '../lib/vyosApi'
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

  // Masking/Reveal only ever applies to already-committed entries
  // fetched from the backend (the default "queue immediately" mode) -
  // never to onAdd/onRemove's local draft state, which is whatever
  // the user is actively typing right now for a container that
  // doesn't exist on the router yet (see ContainerCreateNestedSections.tsx).
  // There's nothing there to reveal: it was never fetched, so it was
  // never server-masked in the first place, and hiding the user's own
  // just-typed value from them would be actively unhelpful.
  const committed = !onAdd

  return (
    <div>
      <ul className="space-y-1">
        {items.map((item) => (
          <Entry
            key={item.id}
            item={item}
            path={[...basePath, item.id, 'value']}
            masked={committed && isMaskedPath([...basePath, item.id, 'value'])}
            onRemove={() => queueRemove(item.id)}
          />
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

/**
 * A single id/value row. Mirrors TreeNode.tsx's LeafRow Reveal
 * pattern for a masked entry (same POST /api/config/reveal
 * mechanism, same Reveal/Hide toggle), scaled down to this
 * component's flatter, single-line-per-entry layout.
 */
function Entry({
  item,
  path,
  masked,
  onRemove,
}: {
  item: { id: string; value: string }
  path: string[]
  masked: boolean
  onRemove: () => void
}) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)

  // Deliberately gated on the `masked` prop rather than recomputing
  // isMaskedPath(path) here - the parent already folded in the
  // committed-vs-draft distinction (see its own comment), and
  // duplicating the check here without that gate would re-mask a
  // container-create-time draft value the user just typed themselves.
  const displayValue = revealed ?? (masked ? MASK_PLACEHOLDER : item.value)

  async function reveal() {
    setRevealing(true)
    setRevealError(null)
    try {
      const { value: real } = await revealValue(path)
      setRevealed(real)
    } catch (err) {
      setRevealError(err instanceof ApiError ? err.message : 'Failed to reveal value.')
    } finally {
      setRevealing(false)
    }
  }

  function hide() {
    setRevealed(null)
    setRevealError(null)
  }

  return (
    <li className="flex flex-col gap-1 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-slate-300">
          {item.id}{' '}
          <span className={masked && !revealed ? 'italic text-slate-500' : 'text-slate-500'}>
            = {displayValue}
          </span>
        </span>
        <div className="flex items-center gap-2">
          {masked &&
            (revealed ? (
              <button onClick={hide} className="text-accent-500 hover:text-accent-400">
                Hide
              </button>
            ) : (
              <button
                onClick={() => void reveal()}
                disabled={revealing}
                className="text-accent-500 hover:text-accent-400 disabled:opacity-50"
              >
                {revealing ? 'Revealing…' : 'Reveal'}
              </button>
            ))}
          <button
            onClick={onRemove}
            className="text-slate-500 hover:text-danger-500"
            aria-label={`Remove ${item.id}`}
          >
            Remove
          </button>
        </div>
      </div>
      {revealError && <p className="text-danger-500">{revealError}</p>}
    </li>
  )
}
