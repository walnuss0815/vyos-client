import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../lib/api'
import * as api from '../lib/vyosApi'
import { maskValue } from '../lib/masking'
import { usePendingChangesStore } from '../store/pendingChanges'
import type { ConfigOp } from '../lib/vyosApi'

type ConfirmState = { active: true; secondsLeft: number } | { active: false }

// Matches the confirmSeconds bounds enforced server-side in
// handleCommit (backend/internal/api/config_handlers.go).
const MIN_CONFIRM_SECONDS = 10
const MAX_CONFIRM_SECONDS = 600

// Builds a masked, human-readable description of an op for display
// (both the visible list text and the discard button's aria-label).
// Deliberately does NOT use PendingChange.label: every call site that
// constructs a label embeds the raw, unmasked value, and label is only
// ever meant as a fallback hint, not a value carrier. Routing every
// display surface through this single function makes it structurally
// impossible for a future call site to leak a secret into the DOM
// (via aria-label, title, or similar) the way the old aria-label did.
function describeChange(op: ConfigOp): string {
  const value = op.value ? ` '${maskValue(op.path, op.value)}'` : ''
  return `${op.op} ${op.path.join(' ')}${value}`
}

// VyOS's own config syntax has no escape mechanism for an embedded
// single quote, so a literal `'` is rejected at commit time with a
// raw, VyOS-internals-flavored error ("Cannot use the single quote (')
// character in a value string"). Nothing upstream of this component
// validates for that (forms only check things like "already
// exists"/required fields), so without this check the first the user
// hears about it is that confusing post-commit error. Checked here,
// once, for every op regardless of which form/page queued it, rather
// than duplicating the check across every free-text field in the app.
//
// Checks every path segment too, not just value: most producers only
// ever put free text into value (a scalar leaf's own field), but a
// handful embed user-typed text directly into a path segment instead
// - e.g. bgpGlobalForm.ts's addNetworkOp/addRedistributionOps (a typed
// prefix/source becomes a `network <prefix>`/`redistribute <source>`
// tag-node segment) and haVrrpForm.ts's addVRRPGroupAddressOps (a
// typed address becomes an `address <addr>` tag-node segment) - both
// producing ops with no `value` field at all for the offending
// segment, which the old value-only check couldn't see.
function hasInvalidQuote(op: ConfigOp): boolean {
  return (typeof op.value === 'string' && op.value.includes("'")) || op.path.some((segment) => segment.includes("'"))
}

export default function PendingChangesBar() {
  const changes = usePendingChangesStore((s) => s.changes)
  const remove = usePendingChangesStore((s) => s.remove)
  const clear = usePendingChangesStore((s) => s.clear)
  const queryClient = useQueryClient()

  const [expanded, setExpanded] = useState(false)
  const [safeApply, setSafeApply] = useState(true)
  const [confirmSeconds, setConfirmSeconds] = useState(90)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState>({ active: false })
  // Whether "Commit & Save" (rather than plain "Commit") was clicked
  // to start the current commit-confirm cycle, so handleKeep knows
  // whether to also save once the user confirms. Without this, "&
  // Save" was silently dropped whenever Safe apply was on (the
  // default) - api.save() was only ever called from the no-confirm
  // path in runCommit, never after a later confirm.
  const [saveAfterConfirm, setSaveAfterConfirm] = useState(false)

  // Also stay mounted (rather than disappearing) when there's an error
  // to show, even once changes is empty - e.g. a commit succeeded
  // (clearing the changeset) but the follow-up Save failed, which must
  // remain visible rather than vanishing along with the now-empty list.
  if (changes.length === 0 && !confirmState.active && !error) return null

  // Clearing the confirmSeconds field entirely produces Number('') ===
  // 0, which vyosApi.commit() would otherwise silently collapse to "no
  // confirm_time sent" (0 is falsy) - i.e. commit-confirm protection
  // quietly disabled while "Safe apply" still looks checked. Given the
  // whole point of this feature is preventing lockout scenarios, an
  // invalid value must block committing (visibly, via the disabled
  // buttons below), not silently degrade to "unsafe".
  const confirmSecondsValid =
    !safeApply || (confirmSeconds >= MIN_CONFIRM_SECONDS && confirmSeconds <= MAX_CONFIRM_SECONDS)

  const invalidQuoteChanges = changes.filter((c) => hasInvalidQuote(c.op))
  const hasInvalidQuoteValue = invalidQuoteChanges.length > 0

  // Every page's data (Config Tree, Firewall, and eventually DHCP) is
  // fetched under a ['config-tree', ...] query key. Invalidating that
  // whole prefix after a successful commit/confirm is what makes those
  // pages reflect the change without a manual reload - there is no
  // other cache to keep in sync, by design (see docs/architecture.md).
  function invalidateConfigQueries() {
    void queryClient.invalidateQueries({ queryKey: ['config-tree'] })
  }

  // Persists the already-applied running config to disk. Used both
  // right after a no-confirm commit and after confirming a pending
  // commit-confirm. A failure here is deliberately reported with a
  // distinct message and does NOT re-throw into the caller's catch
  // block: the commit itself already succeeded and is live, so
  // "Failed to apply changes" (the generic commit-failure message)
  // would be actively misleading - only persistence-to-disk failed,
  // and the change will be lost on reboot unless the user retries Save.
  async function saveAfterSuccessfulCommit() {
    try {
      await api.save()
    } catch (err) {
      const detail = err instanceof ApiError ? err.message : 'saving failed'
      setError(
        `Applied but not saved: ${detail}. Your change is live but will be lost on reboot unless you save.`,
      )
    }
  }

  async function runCommit(alsoSave: boolean) {
    setBusy(true)
    setError(null)
    try {
      const result = await api.commit(
        changes.map((c) => c.op),
        safeApply ? confirmSeconds : undefined,
      )
      if (result.pendingConfirm) {
        setSaveAfterConfirm(alsoSave)
        setConfirmState({ active: true, secondsLeft: confirmSeconds })
        return
      }
      clear()
      invalidateConfigQueries()
      if (alsoSave) {
        await saveAfterSuccessfulCommit()
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to apply changes.')
    } finally {
      setBusy(false)
    }
  }

  async function handleKeep() {
    setBusy(true)
    setError(null)
    try {
      await api.confirmCommit()
      clear()
      invalidateConfigQueries()
      setConfirmState({ active: false })
      if (saveAfterConfirm) {
        await saveAfterSuccessfulCommit()
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to confirm changes.')
    } finally {
      setBusy(false)
      setSaveAfterConfirm(false)
    }
  }

  if (confirmState.active) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-warning-500/40 bg-surface-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-warning-500">Keep these changes?</p>
            <p className="text-sm text-slate-400">
              VyOS will automatically revert to the previous configuration if you don't confirm
              within the commit-confirm window.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleKeep}
              disabled={busy}
              className="rounded-lg bg-success-500 px-4 py-2 text-sm font-medium text-black hover:brightness-110 disabled:opacity-60"
            >
              Keep changes
            </button>
          </div>
        </div>
        {error && <p className="px-4 pb-3 text-sm text-danger-500">{error}</p>}
      </div>
    )
  }

  // A commit can succeed (clearing the changeset) while the follow-up
  // Save still fails - see saveAfterSuccessfulCommit. There's nothing
  // pending to act on anymore, so show just the error rather than a
  // "0 pending changes" toolbar with active Commit/Discard buttons
  // that would have nothing meaningful to do.
  if (changes.length === 0 && error) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-danger-500/40 bg-surface-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-danger-500">{error}</p>
          <button
            onClick={() => setError(null)}
            className="shrink-0 rounded-lg border border-surface-border px-3 py-1.5 text-sm text-slate-300 hover:bg-surface-800"
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-surface-border bg-surface-900/95 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-sm font-medium text-slate-200 hover:text-white"
          >
            {changes.length} pending change{changes.length === 1 ? '' : 's'}{' '}
            <span className="text-slate-500">{expanded ? '▲' : '▼'}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={safeApply}
                onChange={(e) => setSafeApply(e.target.checked)}
                className="accent-accent-500"
              />
              Safe apply
              {safeApply && (
                <input
                  type="number"
                  min={MIN_CONFIRM_SECONDS}
                  max={MAX_CONFIRM_SECONDS}
                  value={confirmSeconds}
                  onChange={(e) => setConfirmSeconds(Number(e.target.value))}
                  className={`ml-1 w-14 rounded border bg-surface-800 px-1 py-0.5 text-xs text-white ${
                    confirmSecondsValid ? 'border-surface-border' : 'border-danger-500'
                  }`}
                />
              )}
              {safeApply && <span>sec</span>}
            </label>

            <button
              onClick={() => clear()}
              disabled={busy}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-slate-300 hover:bg-surface-800 disabled:opacity-60"
            >
              Discard
            </button>
            <button
              onClick={() => void runCommit(false)}
              disabled={busy || !confirmSecondsValid || hasInvalidQuoteValue}
              className="rounded-lg border border-accent-500 px-3 py-1.5 text-sm font-medium text-accent-500 hover:bg-accent-500/10 disabled:opacity-60"
            >
              Commit
            </button>
            <button
              onClick={() => void runCommit(true)}
              disabled={busy || !confirmSecondsValid || hasInvalidQuoteValue}
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-60"
            >
              Commit &amp; Save
            </button>
          </div>
        </div>

        {!confirmSecondsValid && (
          <p className="mt-2 text-sm text-danger-500">
            Safe apply seconds must be between {MIN_CONFIRM_SECONDS} and {MAX_CONFIRM_SECONDS}.
          </p>
        )}
        {hasInvalidQuoteValue && (
          <p className="mt-2 text-sm text-danger-500">
            {invalidQuoteChanges.length} pending change{invalidQuoteChanges.length === 1 ? '' : 's'} contain
            a single quote (') character, which VyOS configuration values can't contain. Edit or discard{' '}
            {invalidQuoteChanges.length === 1 ? 'it' : 'them'} before committing.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-danger-500">{error}</p>}

        {expanded && (
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-surface-border pt-3">
            {changes.map((c) => {
              const invalidQuote = hasInvalidQuote(c.op)
              return (
                <li
                  key={c.id}
                  className={`flex items-center justify-between gap-2 rounded px-2 py-1 font-mono text-xs text-slate-300 hover:bg-surface-800 ${
                    invalidQuote ? 'ring-1 ring-danger-500' : ''
                  }`}
                >
                  <span className="truncate">
                    <span
                      className={
                        c.op.op === 'delete'
                          ? 'text-danger-500'
                          : c.op.op === 'comment'
                            ? 'text-slate-500'
                            : 'text-success-500'
                      }
                    >
                      {c.op.op}
                    </span>{' '}
                    {c.op.path.join(' ')}
                    {c.op.value ? ` '${maskValue(c.op.path, c.op.value)}'` : ''}
                    {invalidQuote && (
                      <span className="ml-1 text-danger-500">(contains an unsupported single quote)</span>
                    )}
                  </span>
                  <button
                    onClick={() => remove(c.id)}
                    className="shrink-0 text-slate-500 hover:text-danger-500"
                    aria-label={`Discard change: ${describeChange(c.op)}`}
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
