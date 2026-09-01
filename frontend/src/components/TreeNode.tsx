import { useState } from 'react'
import { inputClass } from '../lib/formStyles'
import { noExtensionInputProps } from '../lib/inputProtection'
import { isMaskedPath, maskValue } from '../lib/masking'
import { ApiError } from '../lib/api'
import { revealValue } from '../lib/vyosApi'
import { usePendingChangesStore } from '../store/pendingChanges'

interface TreeNodeProps {
  /** The path segment this node was reached by (its own name), or null
   * for the invisible root. */
  segment: string | null
  path: string[]
  value: unknown
  depth: number
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export default function TreeNode({ segment, path, value, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1)
  const [showAddChild, setShowAddChild] = useState(false)
  const add = usePendingChangesStore((s) => s.add)

  const label = path.join(' ')

  function queueDelete(deleteValue?: string) {
    add({
      op: { op: 'delete', path, value: deleteValue },
      label: deleteValue ? `delete ${label} '${deleteValue}'` : `delete ${label}`,
    })
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    const isFlagNode = entries.length === 0 && depth > 0

    if (isFlagNode) {
      return (
        <Row
          segment={segment}
          right={
            <button
              onClick={() => queueDelete()}
              className="text-xs text-slate-500 hover:text-danger-500"
            >
              Remove
            </button>
          }
        />
      )
    }

    return (
      <div>
        <Row
          segment={segment}
          expandable
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          right={
            depth > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddChild((v) => !v)}
                  className="text-xs text-accent-500 hover:text-accent-400"
                >
                  + Add
                </button>
                <button
                  onClick={() => queueDelete()}
                  className="text-xs text-slate-500 hover:text-danger-500"
                >
                  Remove
                </button>
              </div>
            )
          }
        />
        {expanded && (
          <div className="ml-4 border-l border-surface-border pl-2">
            {showAddChild && (
              <AddChildForm path={path} onDone={() => setShowAddChild(false)} />
            )}
            {entries.map(([key, child]) => (
              <TreeNode
                key={key}
                segment={key}
                path={[...path, key]}
                value={child}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (Array.isArray(value)) {
    const sensitive = isMaskedPath(path)
    return (
      <div>
        <Row segment={segment} />
        <div className="ml-4 border-l border-surface-border pl-2">
          {value.map((item, i) => (
            // Keying on index alone breaks if items are ever
            // inserted/removed anywhere but the end (React would then
            // reuse the wrong item's DOM/state). Combining the value
            // with its index gives a stable-enough key for this
            // read-mostly list without requiring values to be unique.
            <LeafRow
              key={`${i}-${String(item)}`}
              path={path}
              value={String(item)}
              // For a sensitive leaf, `item` here is already the
              // server-masked placeholder (mask.Tree replaces every
              // element), not the real value - wiring per-item delete
              // to it would queue a delete for the literal placeholder
              // string, which can never match a real VyOS value.
              // "Clear all values" below is offered instead.
              onDelete={sensitive ? undefined : () => queueDelete(String(item))}
            />
          ))}
          {sensitive && value.length > 0 && (
            <button
              onClick={() => queueDelete()}
              className="py-1 pl-1 text-xs text-slate-500 hover:text-danger-500"
            >
              Clear all values
            </button>
          )}
          <AddValueForm path={path} existingValues={value.map(String)} />
        </div>
      </div>
    )
  }

  // Scalar leaf.
  return (
    <LeafRow segment={segment} path={path} value={String(value)} onDelete={() => queueDelete()} editable />
  )
}

function Row({
  segment,
  expandable,
  expanded,
  onToggle,
  right,
}: {
  segment: string | null
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 pl-1 text-sm">
      <button
        onClick={onToggle}
        disabled={!expandable}
        className={`flex items-center gap-1 font-mono ${expandable ? 'cursor-pointer text-slate-200 hover:text-white' : 'text-slate-400'}`}
      >
        {expandable && <span className="text-slate-500">{expanded ? '▾' : '▸'}</span>}
        {segment}
      </button>
      {right}
    </div>
  )
}

function LeafRow({
  segment,
  path,
  value,
  onDelete,
  editable,
}: {
  segment?: string | null
  path: string[]
  value: string
  /** Omit to hide the Delete action entirely - used for items of a
   * sensitive multi-value array, where the individual item's real
   * value isn't available client-side to delete by (see the
   * Array.isArray branch above). */
  onDelete?: () => void
  editable?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)
  const add = usePendingChangesStore((s) => s.add)
  const sensitive = isMaskedPath(path)
  const displayValue = revealed ?? maskValue(path, value)
  // Reveal is only offered for a genuine scalar leaf (editable=true),
  // never for one item of a sensitive multi-value array: the backend
  // endpoint is deliberately single-value-only (VyOS's own returnValue
  // op is documented the same way), and an individual array item's
  // real value isn't identifiable client-side to request anyway (see
  // the comment on the Array.isArray branch above).
  const canReveal = sensitive && editable

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

  function queueSet() {
    add({ op: { op: 'set', path, value: draft }, label: `set ${path.join(' ')} '${draft}'` })
    setEditing(false)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-1 py-1 pl-1 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-slate-300">
          {segment && <span className="text-slate-500">{segment} = </span>}
          <span className={sensitive && !revealed ? 'italic text-slate-500' : 'text-white'}>
            {displayValue}
          </span>
        </span>
        <div className="flex items-center gap-2">
          {canReveal &&
            (revealed ? (
              <button onClick={hide} className="text-xs text-accent-500 hover:text-accent-400">
                Hide
              </button>
            ) : (
              <button
                onClick={() => void reveal()}
                disabled={revealing}
                className="text-xs text-accent-500 hover:text-accent-400 disabled:opacity-50"
              >
                {revealing ? 'Revealing…' : 'Reveal'}
              </button>
            ))}
          {editable && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="text-xs text-accent-500 hover:text-accent-400"
            >
              {sensitive ? 'Replace' : 'Edit'}
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="text-xs text-slate-500 hover:text-danger-500">
              Delete
            </button>
          )}
        </div>
      </div>
      {revealError && <p className="text-xs text-danger-500">{revealError}</p>}
      {editing && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            {...noExtensionInputProps}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={sensitive ? 'new value' : value}
            className={`flex-1 ${inputClass}`}
          />
          <button
            onClick={queueSet}
            disabled={!draft}
            className="rounded bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
          >
            Queue
          </button>
        </div>
      )}
    </div>
  )
}

function AddValueForm({ path, existingValues }: { path: string[]; existingValues: string[] }) {
  const [value, setValue] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  const taken = value !== '' && existingValues.includes(value)

  function submit() {
    if (!value || taken) return
    add({ op: { op: 'set', path, value }, label: `set ${path.join(' ')} '${value}'` })
    setValue('')
  }

  return (
    <div className="py-1 pl-1">
      <div className="flex items-center gap-2">
        <input
          {...noExtensionInputProps}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="add value…"
          className={`flex-1 ${inputClass}`}
        />
        <button
          onClick={submit}
          disabled={!value || taken}
          className="rounded bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {taken && <p className="mt-1 text-xs text-danger-500">This value is already added.</p>}
    </div>
  )
}

function AddChildForm({
  path,
  onDone,
}: {
  path: string[]
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const add = usePendingChangesStore((s) => s.add)

  function submit() {
    if (!name) return
    const childPath = [...path, name]
    add({
      op: { op: 'set', path: childPath, value: value || undefined },
      label: value ? `set ${childPath.join(' ')} '${value}'` : `set ${childPath.join(' ')}`,
    })
    setName('')
    setValue('')
    onDone()
  }

  return (
    <div className="flex items-center gap-2 py-1 pl-1">
      <input
        autoFocus
        {...noExtensionInputProps}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="node name"
        className={`w-32 ${inputClass}`}
      />
      <input
        {...noExtensionInputProps}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="value (optional)"
        className={`flex-1 ${inputClass}`}
      />
      <button
        onClick={submit}
        disabled={!name}
        className="rounded bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
      >
        Add
      </button>
    </div>
  )
}
