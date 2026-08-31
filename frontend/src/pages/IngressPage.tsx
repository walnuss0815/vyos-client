import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useIngresses } from '../hooks/useIngresses'
import { useSystemInfo } from '../hooks/useSystemInfo'
import { buttonClass, inputClass, labelClass } from '../lib/formStyles'
import { noExtensionInputProps } from '../lib/inputProtection'
import {
  createIngress,
  deleteIngress,
  updateIngress,
  type IngressEntry,
  type IngressEntryInput,
  type IngressHeaderInput,
} from '../lib/vyosApi'

const codeClass = 'rounded bg-surface-800 px-1 py-0.5 font-mono text-xs text-slate-300'

/** Matches the backend's own namePattern (backend/internal/ingress/
 * store.go) - checked here too so a typo shows up immediately instead
 * of only after a round trip to the API. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/**
 * Manages Ingress entries - lets a logged-in user reach a web UI on
 * the router's own network through this app (/ingress/<name>/...),
 * without opening a separate port for it. See docs/architecture.md's
 * "Ingress" section.
 *
 * Unlike almost everything else in this app, entries here are NOT
 * VyOS configuration: they're this app's own state (a JSON file on a
 * mounted volume - see backend/internal/ingress/store.go), so
 * create/edit/delete apply immediately via direct API calls, the same
 * "no pending-changes cart" pattern as system/container image
 * management (see system/ImagesPage.tsx) - there's nothing to
 * review/discard before a commit, because there's no VyOS commit
 * involved at all.
 */
export default function IngressPage() {
  const systemInfoQuery = useSystemInfo()
  const ingressEnabled = systemInfoQuery.data?.ingressEnabled ?? false
  const ingressesQuery = useIngresses(ingressEnabled)
  const queryClient = useQueryClient()

  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmingDeleteName, setConfirmingDeleteName] = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['ingress'] })
  }

  async function handleDelete(name: string) {
    if (confirmingDeleteName !== name) {
      setConfirmingDeleteName(name)
      setDeleteError(null)
      return
    }
    setConfirmingDeleteName(null)
    setDeletingName(name)
    setDeleteError(null)
    try {
      await deleteIngress(name)
      refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete ingress entry.')
    } finally {
      setDeletingName(null)
    }
  }

  const entries = ingressesQuery.data ?? []
  const existingNames = entries.map((e) => e.name)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="mb-1 text-lg font-semibold text-white">Ingress</h1>
        <p className="text-sm text-slate-400">
          Reach a web UI on the router&apos;s own network through this app, without opening a
          separate port for it. Applies immediately - there&apos;s no pending-changes review
          step here, since these entries aren&apos;t VyOS configuration.
        </p>
      </div>

      {!ingressEnabled ? (
        <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
          <p className="mb-2 text-sm font-medium text-white">Ingress is disabled</p>
          <p className="text-sm text-slate-400">
            Set <code className={codeClass}>INGRESS_ENABLED=true</code> and mount a writable
            volume for <code className={codeClass}>INGRESS_DATA_DIR</code> (default{' '}
            <code className={codeClass}>/data</code>) to turn this feature on - see the
            configuration reference docs for details. Disabled by default: unlike everything
            else in this app, an enabled ingress lets this backend reach hosts beyond VyOS&apos;s
            own API.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Entries</p>
            <button
              onClick={() => {
                setShowAdd((v) => !v)
                setEditing(null)
              }}
              className={`bg-accent-600 ${buttonClass}`}
            >
              {showAdd ? 'Cancel' : '+ Add ingress'}
            </button>
          </div>

          {showAdd && (
            <div className="mb-3 rounded-xl border border-surface-border bg-surface-900 p-4">
              <IngressFormPanel
                existingNames={existingNames}
                onDone={() => {
                  setShowAdd(false)
                  refresh()
                }}
              />
            </div>
          )}

          {ingressesQuery.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
          {ingressesQuery.isError && (
            <p className="text-sm text-danger-500">Failed to load ingress entries.</p>
          )}
          {deleteError && <p className="mb-3 text-sm text-danger-500">{deleteError}</p>}

          {entries.length === 0 && !showAdd && !ingressesQuery.isLoading && (
            <p className="text-xs text-slate-500">No ingress entries configured yet.</p>
          )}

          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.name} className="rounded-xl border border-surface-border bg-surface-900 p-4">
                {editing === entry.name ? (
                  <IngressFormPanel
                    entry={entry}
                    existingNames={existingNames}
                    onDone={() => {
                      setEditing(null)
                      refresh()
                    }}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono text-sm text-white">{entry.name}</span>
                        {entry.description && (
                          <span className="ml-2 text-xs text-slate-400">{entry.description}</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <a
                          href={`/ingress/${encodeURIComponent(entry.name)}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-accent-500 hover:text-accent-400"
                        >
                          Open
                        </a>
                        <button
                          onClick={() => {
                            setEditing(entry.name)
                            setShowAdd(false)
                          }}
                          className="text-xs text-accent-500 hover:text-accent-400"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDelete(entry.name)}
                          disabled={deletingName === entry.name}
                          className={
                            confirmingDeleteName === entry.name
                              ? 'text-xs text-danger-500 hover:text-danger-400'
                              : 'text-xs text-slate-500 hover:text-danger-500'
                          }
                        >
                          {deletingName === entry.name
                            ? 'Deleting…'
                            : confirmingDeleteName === entry.name
                              ? 'Confirm delete?'
                              : 'Delete'}
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-400">
                      {entry.targetUrl}
                      {entry.skipTlsVerify && ' · TLS verification skipped'}
                    </p>
                    {entry.headers.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Headers: {entry.headers.map((h) => h.name).join(', ')}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function IngressFormPanel({
  entry,
  existingNames,
  onDone,
}: {
  /** undefined = creating a new entry. */
  entry?: IngressEntry
  existingNames: string[]
  onDone: () => void
}) {
  const isCreate = entry === undefined
  const [name, setName] = useState('')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [targetUrl, setTargetUrl] = useState(entry?.targetUrl ?? '')
  const [skipTlsVerify, setSkipTlsVerify] = useState(entry?.skipTlsVerify ?? false)
  // Pre-populated with every existing header's NAME only (never its
  // value - see IngressHeader's doc comment in vyosApi.ts); each
  // starts with an empty `value`, meaning "keep what's already
  // stored" unless the operator types a replacement.
  const [headers, setHeaders] = useState<IngressHeaderInput[]>(
    (entry?.headers ?? []).map((h) => ({ name: h.name, value: '' })),
  )
  const [newHeaderName, setNewHeaderName] = useState('')
  const [newHeaderValue, setNewHeaderValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedName = name.trim()
  const nameTaken = isCreate && existingNames.includes(trimmedName)
  const nameFormatValid = NAME_PATTERN.test(trimmedName)
  const nameValid = !isCreate || (trimmedName !== '' && nameFormatValid && !nameTaken)
  const canSubmit = nameValid && targetUrl.trim() !== '' && !submitting

  const originalHeaderNames = new Set((entry?.headers ?? []).map((h) => h.name))

  function addHeader() {
    const n = newHeaderName.trim()
    if (!n || headers.some((h) => h.name.toLowerCase() === n.toLowerCase())) return
    setHeaders((hs) => [...hs, { name: n, value: newHeaderValue }])
    setNewHeaderName('')
    setNewHeaderValue('')
  }

  function removeHeader(headerName: string) {
    setHeaders((hs) => hs.filter((h) => h.name !== headerName))
  }

  function updateHeaderValue(headerName: string, value: string) {
    setHeaders((hs) => hs.map((h) => (h.name === headerName ? { ...h, value } : h)))
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const input: IngressEntryInput = {
        description: description.trim(),
        targetUrl: targetUrl.trim(),
        headers,
        skipTlsVerify,
      }
      if (isCreate) {
        await createIngress(trimmedName, input)
      } else {
        await updateIngress(entry.name, input)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the ingress entry.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      {isCreate && (
        <label className={`${labelClass} mb-3`}>
          Name
          <input
            {...noExtensionInputProps}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nas"
            className={`font-mono ${inputClass}`}
          />
          <span className="text-slate-500">Lowercase letters, digits, and &quot;-&quot; only.</span>
          {trimmedName !== '' && !nameFormatValid && (
            <span className="text-danger-500">Not a valid name - lowercase letters, digits, and &quot;-&quot; only.</span>
          )}
          {nameTaken && <span className="text-danger-500">An ingress named &quot;{trimmedName}&quot; already exists.</span>}
        </label>
      )}

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Description (optional)
          <input
            {...noExtensionInputProps}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Target URL
          <input
            {...noExtensionInputProps}
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="http://10.0.0.5:8080"
            className={`font-mono ${inputClass}`}
          />
        </label>
      </div>

      <label className="mb-3 flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={skipTlsVerify}
          onChange={(e) => setSkipTlsVerify(e.target.checked)}
          className="accent-accent-500"
        />
        Skip TLS certificate verification (target uses a self-signed certificate)
      </label>

      <div className="mb-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Request headers (optional)
        </p>
        <p className="mb-2 text-xs text-slate-500">
          Injected into every proxied request - e.g. a static API key or bearer token the target
          expects - overriding anything the browser itself sent for that header. A previously
          saved header&apos;s value is never shown again here; leave it blank to keep it
          unchanged.
        </p>
        <ul className="space-y-1">
          {headers.map((h) => (
            <li key={h.name} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate font-mono text-xs text-slate-300">{h.name}</span>
              <input
                {...noExtensionInputProps}
                value={h.value}
                onChange={(e) => updateHeaderValue(h.name, e.target.value)}
                placeholder={originalHeaderNames.has(h.name) ? '(unchanged - leave blank to keep)' : 'value'}
                className={`flex-1 ${inputClass}`}
              />
              <button
                onClick={() => removeHeader(h.name)}
                className="text-xs text-slate-500 hover:text-danger-500"
                aria-label={`Remove ${h.name}`}
              >
                Remove
              </button>
            </li>
          ))}
          {headers.length === 0 && <li className="text-xs text-slate-500">None configured.</li>}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <input
            {...noExtensionInputProps}
            value={newHeaderName}
            onChange={(e) => setNewHeaderName(e.target.value)}
            placeholder="header name"
            className={inputClass}
          />
          <input
            {...noExtensionInputProps}
            value={newHeaderValue}
            onChange={(e) => setNewHeaderValue(e.target.value)}
            placeholder="value"
            className={inputClass}
          />
          <button onClick={addHeader} disabled={!newHeaderName.trim()} className={`bg-accent-600 ${buttonClass}`}>
            Add header
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-danger-500">{error}</p>}

      <div className="flex items-center gap-2">
        <button onClick={() => void submit()} disabled={!canSubmit} className={`bg-accent-600 ${buttonClass}`}>
          {submitting ? 'Saving…' : entry ? 'Save' : 'Add ingress'}
        </button>
        <button onClick={onDone} className="text-xs text-slate-500 hover:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  )
}
