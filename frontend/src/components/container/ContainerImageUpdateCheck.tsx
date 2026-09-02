import { useState } from 'react'
import { containerNamePath } from '../../lib/containerParse'
import { buttonClass } from '../../lib/formStyles'
import { checkContainerImageUpdate, pullContainerImage, type ContainerImageUpdateCheck as CheckResult } from '../../lib/vyosApi'
import { hasPendingSet, usePendingChangesStore } from '../../store/pendingChanges'
import { useContainerImageUpdateChecksStore } from '../../store/containerImageUpdateChecks'

/** Per-container "Check for update" button on the Containers page -
 * see docs/architecture.md's "Container image update checks" section.
 * Entirely disabled by default (CONTAINER_UPDATE_CHECKS_ENABLED) - the
 * disabled state is only discovered after the operator actually
 * clicks the button (rather than fetched up front for every
 * container, the way UpgradesPage.tsx's single self-upgrade check
 * does), since there's no cheap way to know it in advance without a
 * request per container.
 *
 * Deliberately manual/on-demand only, never triggered automatically
 * (e.g. on mount or when the Containers page loads) - unlike
 * self-upgrade's single, server-cached GitHub check, this contacts
 * whatever registry the container's own image reference happens to
 * point at, with no server-side caching, so an operator with many
 * containers configured shouldn't have all of them checked at once
 * just from visiting the page.
 *
 * The last result IS remembered client-side though
 * (store/containerImageUpdateChecks.ts, backed by localStorage) so it
 * survives a reload/browser restart instead of vanishing the instant
 * this component unmounts - see that store's own doc comment for why
 * this doesn't conflict with "manual only": nothing here ever
 * triggers a check on its own, it only stops discarding one the
 * operator already explicitly asked for. */
export default function ContainerImageUpdateCheck({ image, containerName }: { image: string; containerName: string }) {
  const add = usePendingChangesStore((s) => s.add)
  const changes = usePendingChangesStore((s) => s.changes)
  const cached = useContainerImageUpdateChecksStore((s) => s.checks[containerName])
  const setCachedCheck = useContainerImageUpdateChecksStore((s) => s.setCheck)
  // A cached entry only counts if it was checked against the image
  // this container currently has - if the operator edited the image
  // since (or already accepted this very update), the old result no
  // longer describes anything real.
  const cachedForCurrentImage = cached?.image === image ? cached : undefined

  const [checking, setChecking] = useState(false)
  // Lazily hydrated from the persisted cache on mount (not on every
  // render - a later cache change from another instance/tab
  // shouldn't yank a value out from under an in-progress check).
  const [result, setResult] = useState<CheckResult | null>(() => cachedForCurrentImage?.result ?? null)
  const [checkedAt, setCheckedAt] = useState<number | null>(() => cachedForCurrentImage?.checkedAt ?? null)
  const [error, setError] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [queued, setQueued] = useState(false)

  const imagePath = containerNamePath(containerName, 'image')
  const upgradeAlreadyQueued = hasPendingSet(changes, imagePath)
  // Kept as a reference to `result` itself (not a plain boolean) so
  // TypeScript can narrow `upgradeInfo.newImageRef`/`.latestTag` as
  // non-null below, rather than needing a separate non-null assertion.
  const upgradeInfo = result && result.enabled && result.recognized && result.updateAvailable && !queued ? result : null

  async function check() {
    setChecking(true)
    setError(null)
    setResult(null)
    setQueued(false)
    try {
      const checkResult = await checkContainerImageUpdate(image)
      const now = Date.now()
      setResult(checkResult)
      setCheckedAt(now)
      setCachedCheck(containerName, image, checkResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for updates.')
    } finally {
      setChecking(false)
    }
  }

  async function upgrade(newImageRef: string) {
    if (upgradeAlreadyQueued) return
    setPulling(true)
    setError(null)
    try {
      await pullContainerImage(newImageRef)
      add({ op: { op: 'set', path: imagePath, value: newImageRef }, label: `set ${imagePath.join(' ')} '${newImageRef}'` })
      setQueued(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull the new image.')
    } finally {
      setPulling(false)
    }
  }

  return (
    <div className="mt-2 text-xs">
      {upgradeInfo ? (
        <>
          <button
            onClick={() => void upgrade(upgradeInfo.newImageRef)}
            disabled={pulling || upgradeAlreadyQueued}
            className={`bg-accent-600 ${buttonClass}`}
          >
            {pulling ? 'Pulling…' : 'Upgrade'}
          </button>{' '}
          <button
            onClick={() => void check()}
            disabled={checking || pulling}
            className={`bg-surface-800 ${buttonClass}`}
          >
            {checking ? 'Checking…' : 'Re-check'}
          </button>
          <p className="mt-1 text-warning-500">
            Update available: <span className="font-mono">{upgradeInfo.latestTag}</span>
          </p>
        </>
      ) : (
        !queued && (
          <button onClick={() => void check()} disabled={checking} className={`bg-surface-800 ${buttonClass}`}>
            {checking ? 'Checking…' : 'Check for update'}
          </button>
        )
      )}

      {result && checkedAt && (
        <p className="mt-1 text-slate-500">Checked at {new Date(checkedAt).toLocaleString()}.</p>
      )}

      {error && <p className="mt-1 text-danger-500">{error}</p>}

      {result && !result.enabled && (
        <p className="mt-1 text-slate-500">
          Container image update checks are disabled - set{' '}
          <code className="rounded bg-surface-800 px-1 py-0.5 font-mono">CONTAINER_UPDATE_CHECKS_ENABLED=true</code> to
          turn this on.
        </p>
      )}

      {result?.enabled && !result.recognized && (
        <p className="mt-1 text-slate-500">
          <span className="font-mono">{result.currentTag}</span> isn&apos;t a recognized version tag - can&apos;t
          check for updates.
        </p>
      )}

      {result?.enabled && result.recognized && !result.updateAvailable && (
        <p className="mt-1 text-slate-500">Up to date (no newer tag found).</p>
      )}

      {upgradeInfo && pulling && (
        <p className="mt-1 text-slate-500">
          Pulling can take several minutes for a large image, with no progress shown until it finishes - this
          isn&apos;t stuck.
        </p>
      )}

      {queued && (
        <p className="mt-1 text-success-500">
          Pulled and queued image <span className="font-mono">{result?.newImageRef}</span> - review and commit below
          (Safe apply recommended: this change recreates the container, and Safe apply automatically reverts if the
          new image doesn&apos;t come back up).
        </p>
      )}
      {upgradeAlreadyQueued && !queued && (
        <p className="mt-1 text-slate-500">
          An image change is already queued for this container - commit or discard it in the pending changes bar
          before queuing another.
        </p>
      )}
    </div>
  )
}
