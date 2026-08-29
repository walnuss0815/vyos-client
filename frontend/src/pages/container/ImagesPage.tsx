import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useContainerConfig } from '../../hooks/useContainerConfig'
import { useContainerImages } from '../../hooks/useContainerImages'
import { unreferencedImages } from '../../lib/containerImageMatch'
import { formatBytes } from '../../lib/formatBytes'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { deleteContainerImage, pullContainerImage } from '../../lib/vyosApi'

/** Container image pull/list/delete - unlike the rest of the Container
 * area (Containers/Networks/Registries, all `/configure`d and staged
 * through the pending-changes cart), this is VyOS *op-mode* data/
 * actions (`show container image`/`add container image <name>`/
 * `delete container image <name>`), applied immediately rather than
 * queued - there's nothing to stage or discard here, matching how
 * VyOS's own CLI behaves for these commands. See useContainerImages.ts
 * and vyosApi.ts's pullContainerImage/deleteContainerImage.
 *
 * A pull can legitimately take several minutes for a large image with
 * no progress reporting mid-flight (VyOS's own REST endpoint is fully
 * synchronous) - the pull button's busy state reflects that instead of
 * looking stuck/broken.
 */
export default function ImagesPage() {
  const query = useContainerImages()
  const { containers } = useContainerConfig()
  const queryClient = useQueryClient()

  const [pullName, setPullName] = useState('')
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)
  const [pullMessage, setPullMessage] = useState<string | null>(null)

  const [confirmingID, setConfirmingID] = useState<string | null>(null)
  const [deletingID, setDeletingID] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const unused = useMemo(
    () => (query.data ? unreferencedImages(query.data, containers) : []),
    [query.data, containers],
  )
  const [confirmingCleanup, setConfirmingCleanup] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [cleanupError, setCleanupError] = useState<string | null>(null)

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['container-images'] })
  }

  async function handleCleanup() {
    if (!confirmingCleanup) {
      setConfirmingCleanup(true)
      setCleanupError(null)
      return
    }
    setConfirmingCleanup(false)
    setCleaningUp(true)
    setCleanupError(null)
    // No bulk-delete endpoint exists (VyOS's own CLI only offers
    // `delete container image <name>` one at a time) - loop
    // individual deletes client-side, same as the CLI would.
    const failures: string[] = []
    for (const image of unused) {
      try {
        await deleteContainerImage(image.id)
      } catch (err) {
        const label = image.tags[0] ?? image.id.slice(0, 12)
        failures.push(`${label}: ${err instanceof Error ? err.message : 'failed to delete'}`)
      }
    }
    if (failures.length > 0) setCleanupError(failures.join('; '))
    refresh()
    setCleaningUp(false)
  }

  async function handlePull() {
    const name = pullName.trim()
    if (!name || pulling) return
    setPulling(true)
    setPullError(null)
    setPullMessage(null)
    try {
      const result = await pullContainerImage(name)
      setPullMessage(result.message || `Pulled ${name}.`)
      setPullName('')
      refresh()
    } catch (err) {
      setPullError(err instanceof Error ? err.message : 'Failed to pull image.')
    } finally {
      setPulling(false)
    }
  }

  async function handleDelete(id: string) {
    if (confirmingID !== id) {
      setConfirmingID(id)
      setDeleteError(null)
      return
    }
    setConfirmingID(null)
    setDeletingID(id)
    setDeleteError(null)
    try {
      await deleteContainerImage(id)
      refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete image.')
    } finally {
      setDeletingID(null)
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Pull an image</p>
        <div className="flex items-center gap-2">
          <input
            value={pullName}
            onChange={(e) => setPullName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handlePull()
            }}
            placeholder="docker.io/library/nginx:latest"
            disabled={pulling}
            className={`flex-1 ${inputClass}`}
          />
          <button
            onClick={() => void handlePull()}
            disabled={pulling || pullName.trim() === ''}
            className={`bg-accent-600 ${buttonClass}`}
          >
            {pulling ? 'Pulling…' : 'Pull'}
          </button>
        </div>
        {pulling && (
          <p className="mt-2 text-xs text-slate-500">
            Pulling can take several minutes for a large image, with no progress shown until it
            finishes - this isn't stuck.
          </p>
        )}
        {pullError && <p className="mt-2 text-xs text-danger-500">{pullError}</p>}
        {pullMessage && !pullError && <p className="mt-2 text-xs text-success-500">{pullMessage}</p>}
      </div>

      {unused.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-surface-900 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-500">
                {unused.length} unused image{unused.length === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Not referenced by any container definition&apos;s image field, and not currently
                in use by a running container (see the &quot;In use&quot; column below) - safe to
                remove on both counts.
              </p>
            </div>
            <button
              onClick={() => void handleCleanup()}
              disabled={cleaningUp}
              className={confirmingCleanup ? `bg-danger-600 ${buttonClass}` : `bg-surface-800 ${buttonClass}`}
            >
              {cleaningUp
                ? 'Deleting…'
                : confirmingCleanup
                  ? `Confirm delete ${unused.length} image${unused.length === 1 ? '' : 's'}?`
                  : `Delete ${unused.length} unused image${unused.length === 1 ? '' : 's'}`}
            </button>
          </div>
          <ul className="mt-2 space-y-0.5 font-mono text-xs text-slate-400">
            {unused.map((image) => (
              <li key={image.id}>{image.tags.join(', ') || image.id.slice(0, 12)}</li>
            ))}
          </ul>
          {cleanupError && <p className="mt-2 text-xs text-danger-500">{cleanupError}</p>}
        </div>
      )}

      {deleteError && (
        <p className="mb-2 text-xs text-danger-500">{deleteError}</p>
      )}

      {query.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {query.isError && <p className="text-sm text-danger-500">Failed to load container images.</p>}
      {query.data && query.data.length === 0 && (
        <p className="text-sm text-slate-500">No container images have been pulled onto this router yet.</p>
      )}
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-800 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">In use</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {query.data.map((image) => (
                <tr key={image.id} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-mono text-xs text-white">
                    {image.tags.join(', ')}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {image.id.slice(0, 12)}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">{formatBytes(image.sizeBytes)}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {new Date(image.createdAt * 1000).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {image.containers > 0 ? `${image.containers} container(s)` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => void handleDelete(image.id)}
                      disabled={deletingID === image.id}
                      className={
                        confirmingID === image.id
                          ? 'text-xs text-danger-500 hover:text-danger-400'
                          : 'text-xs text-slate-500 hover:text-danger-500'
                      }
                    >
                      {deletingID === image.id
                        ? 'Deleting…'
                        : confirmingID === image.id
                          ? 'Confirm delete?'
                          : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
