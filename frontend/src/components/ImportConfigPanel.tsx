import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../lib/api'
import { buttonClass, inputClass, labelClass } from '../lib/formStyles'
import { noExtensionInputProps } from '../lib/inputProtection'
import * as api from '../lib/vyosApi'
import type { ImportMode } from '../lib/vyosApi'

// Matches the confirmSeconds bounds enforced server-side in
// handleImportConfig (backend/internal/api/config_handlers.go), same
// as PendingChangesBar's commit-confirm window.
const MIN_CONFIRM_SECONDS = 10
const MAX_CONFIRM_SECONDS = 600

type ConfirmState = { active: true; secondsLeft: number } | { active: false }

/**
 * Uploads a configuration file and applies it via VyOS's own
 * /config-file endpoint (see vyosApi.ts's importConfig doc comment for
 * the merge/load semantic difference). Deliberately a standalone
 * action rather than something that flows through the pending-changes
 * cart: a file's contents replace-or-overlay the *entire* candidate
 * config in one VyOS-side operation, not a list of discrete set/delete
 * ops this app queued itself, so it doesn't fit that model. Mirrors
 * PendingChangesBar's own commit-confirm UX locally (same "Safe apply"
 * toggle/seconds field and "Keep changes?" follow-up), since VyOS
 * treats commit-confirm as a single global timer regardless of which
 * endpoint started it - confirming here reuses the exact same
 * api.confirmCommit() call PendingChangesBar itself uses.
 */
export default function ImportConfigPanel() {
  const queryClient = useQueryClient()
  const [fileName, setFileName] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<ImportMode>('merge')
  const [acknowledged, setAcknowledged] = useState(false)
  const [safeApply, setSafeApply] = useState(true)
  const [confirmSeconds, setConfirmSeconds] = useState(90)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [confirmState, setConfirmState] = useState<ConfirmState>({ active: false })

  const confirmSecondsValid =
    !safeApply || (confirmSeconds >= MIN_CONFIRM_SECONDS && confirmSeconds <= MAX_CONFIRM_SECONDS)
  const canImport = content.trim() !== '' && confirmSecondsValid && (mode === 'merge' || acknowledged)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSuccess(false)
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      setContent(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.readAsText(file)
  }

  function invalidateConfigQueries() {
    void queryClient.invalidateQueries({ queryKey: ['config-tree'] })
  }

  async function runImport() {
    if (!canImport) return
    setBusy(true)
    setError(null)
    setSuccess(false)
    try {
      const result = await api.importConfig(content, mode, safeApply ? confirmSeconds : undefined)
      if (result.pendingConfirm) {
        setConfirmState({ active: true, secondsLeft: confirmSeconds })
        return
      }
      setSuccess(true)
      invalidateConfigQueries()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import configuration.')
    } finally {
      setBusy(false)
    }
  }

  async function handleKeep() {
    setBusy(true)
    setError(null)
    try {
      await api.confirmCommit()
      setConfirmState({ active: false })
      setSuccess(true)
      invalidateConfigQueries()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to confirm the import.')
    } finally {
      setBusy(false)
    }
  }

  if (confirmState.active) {
    return (
      <div className="rounded-xl border border-warning-500/40 bg-surface-900 p-4">
        <p className="font-medium text-warning-500">Keep this imported configuration?</p>
        <p className="mt-1 text-sm text-slate-400">
          VyOS will automatically revert to the previous configuration if you don't confirm within
          the commit-confirm window.
        </p>
        <button
          onClick={handleKeep}
          disabled={busy}
          className="mt-3 rounded-lg bg-success-500 px-4 py-2 text-sm font-medium text-black hover:brightness-110 disabled:opacity-60"
        >
          Keep changes
        </button>
        {error && <p className="mt-2 text-sm text-danger-500">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>
          Configuration file
          <input
            type="file"
            accept=".txt,.boot,.conf"
            onChange={handleFileChange}
            className="text-xs text-slate-400 file:mr-3 file:rounded file:border-0 file:bg-accent-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-accent-500"
          />
        </label>
        {fileName && <p className="mt-1 text-xs text-slate-500">{fileName} ({content.length.toLocaleString()} characters)</p>}
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="radio"
            name="import-mode"
            checked={mode === 'merge'}
            onChange={() => {
              setMode('merge')
              setAcknowledged(false)
            }}
            className="accent-accent-500"
          />
          Merge (overlay onto the current config; nothing is removed)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="radio"
            name="import-mode"
            checked={mode === 'load'}
            onChange={() => setMode('load')}
            className="accent-accent-500"
          />
          Full replace (load; removes anything not in the file)
        </label>
      </div>

      {mode === 'load' && (
        <div className="rounded-lg border border-danger-500/40 bg-danger-500/10 p-3">
          <p className="text-sm text-danger-500">
            This replaces the <strong>entire</strong> running configuration. If the uploaded file
            doesn't include a working HTTPS API setup (<code>service https api</code>), you could be
            locked out of this app entirely. Safe apply (below) is strongly recommended so VyOS can
            automatically revert if that happens.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="accent-danger-500"
            />
            I understand this may lock me out and have reviewed the file.
          </label>
        </div>
      )}

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
            {...noExtensionInputProps}
            type="number"
            min={MIN_CONFIRM_SECONDS}
            max={MAX_CONFIRM_SECONDS}
            value={confirmSeconds}
            onChange={(e) => setConfirmSeconds(Number(e.target.value))}
            className={`ml-1 w-16 ${inputClass} ${confirmSecondsValid ? '' : 'border-danger-500'}`}
          />
        )}
        {safeApply && <span>sec</span>}
      </label>
      {!confirmSecondsValid && (
        <p className="text-sm text-danger-500">
          Safe apply seconds must be between {MIN_CONFIRM_SECONDS} and {MAX_CONFIRM_SECONDS}.
        </p>
      )}

      <button onClick={() => void runImport()} disabled={!canImport || busy} className={`bg-accent-600 ${buttonClass}`}>
        {busy ? 'Importing…' : 'Import configuration'}
      </button>

      {success && <p className="text-sm text-success-500">Configuration imported successfully.</p>}
      {error && <p className="text-sm text-danger-500">{error}</p>}
    </div>
  )
}
