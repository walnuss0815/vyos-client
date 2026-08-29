import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { useSystemImages } from '../../hooks/useSystemImages'
import { buttonClass, inputClass } from '../../lib/formStyles'
import { addSystemImage, deleteSystemImage } from '../../lib/vyosApi'
import { usePendingChangesStore } from '../../store/pendingChanges'

/**
 * VyOS system releases installed on this router - `show system image`/
 * `add system image <url>`/`delete system image <name>`, entirely
 * distinct from the Container area's own image management (podman
 * images, `pages/container/ImagesPage.tsx`). Like that page, install/
 * delete are VyOS *op-mode* actions applied immediately (not staged) -
 * there's nothing to review/discard for those two.
 *
 * "Set as default boot" is the one exception: switching which
 * already-installed image boots next (VyOS's own rollback mechanism -
 * see docs.vyos.io's "System rollback" section) is an ordinary
 * `set system image default-boot <name>` *configuration* write, so it
 * goes through the normal pending-changes cart like any other config
 * change, fully reviewable/discardable before commit - no separate
 * confirmation dialog needed here, unlike install/delete.
 *
 * Installing a new image never switches to it or reboots by itself -
 * that's always a separate "Set as default boot" (config write) plus
 * a manual reboot (Power tab), which this page nudges toward whenever
 * the default-boot and running images differ.
 */
export default function ImagesPage() {
  const query = useSystemImages()
  const queryClient = useQueryClient()
  const add = usePendingChangesStore((s) => s.add)

  const [installUrl, setInstallUrl] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installMessage, setInstallMessage] = useState<string | null>(null)

  const [confirmingDeleteName, setConfirmingDeleteName] = useState<string | null>(null)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [queuedDefaultBootNames, setQueuedDefaultBootNames] = useState<Set<string>>(new Set())

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['system-images'] })
  }

  const canInstall = installUrl.trim() !== '' && acknowledged && !installing

  async function handleInstall() {
    if (!canInstall) return
    setInstalling(true)
    setInstallError(null)
    setInstallMessage(null)
    try {
      const result = await addSystemImage(installUrl.trim())
      setInstallMessage(result.message || 'Installed successfully.')
      setInstallUrl('')
      setAcknowledged(false)
      refresh()
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Failed to install image.')
    } finally {
      setInstalling(false)
    }
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
      await deleteSystemImage(name)
      refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete image.')
    } finally {
      setDeletingName(null)
    }
  }

  function queueSetDefaultBoot(name: string) {
    add({
      op: { op: 'set', path: ['system', 'image', 'default-boot'], value: name },
      label: `set system image default-boot '${name}'`,
    })
    setQueuedDefaultBootNames((prev) => new Set(prev).add(name))
  }

  const images = query.data ?? []
  const runningImage = images.find((i) => i.isRunning)
  const defaultBootImage = images.find((i) => i.isDefaultBoot)
  const needsReboot =
    !!runningImage && !!defaultBootImage && runningImage.name !== defaultBootImage.name

  return (
    <div>
      <p className="mb-4 text-sm text-slate-400">
        VyOS system releases installed on this router - separate entirely from the Container
        area's own image management (podman images, not VyOS itself). Installing a new release
        doesn't switch to it or reboot on its own; use "Set as default boot" (queued like any
        other configuration change, reviewable in the pending-changes cart) and then reboot.
      </p>

      {needsReboot && (
        <div className="mb-4 rounded-xl border border-warning-500/40 bg-warning-500/10 p-3">
          <p className="text-sm text-warning-500">
            The default-boot image (<span className="font-mono">{defaultBootImage.name}</span>)
            differs from the one currently running (
            <span className="font-mono">{runningImage.name}</span>) - reboot to switch.{' '}
            <NavLink to="/system/power" className="underline hover:text-warning-400">
              Go to Power
            </NavLink>
          </p>
        </div>
      )}

      <div className="mb-4 rounded-xl border border-surface-border bg-surface-900 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Install a new image
        </p>
        <input
          value={installUrl}
          onChange={(e) => setInstallUrl(e.target.value)}
          placeholder="https://downloads.vyos.io/rolling/current/amd64/vyos-rolling-latest.iso"
          disabled={installing}
          className={`w-full ${inputClass}`}
        />
        {installUrl.trim() !== '' && (
          <div className="mt-3 rounded-lg border border-danger-500/40 bg-danger-500/10 p-3">
            <p className="text-sm text-danger-500">
              This downloads and installs a full VyOS release, which can take a long time with no
              progress shown until it finishes - this isn't stuck. If something goes wrong
              mid-install, recovering may require physical or console access to the router. It
              does not affect the currently running system by itself - see "Set as default boot"
              below.
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="accent-danger-500"
              />
              I understand this can take a long time and may require console access to recover
              from a failed install.
            </label>
            <p className="mt-2 text-xs text-slate-400">
              Consider{' '}
              <NavLink to="/config-tree" className="text-accent-500 hover:text-accent-400">
                exporting a copy of the current configuration
              </NavLink>{' '}
              first, as a safety net.
            </p>
          </div>
        )}
        <div className="mt-3">
          <button
            onClick={() => void handleInstall()}
            disabled={!canInstall}
            className={`bg-accent-600 ${buttonClass}`}
          >
            {installing ? 'Installing… (can take a long time)' : 'Install'}
          </button>
        </div>
        {installError && <p className="mt-2 text-xs text-danger-500">{installError}</p>}
        {installMessage && !installError && (
          <p className="mt-2 text-xs text-success-500">{installMessage}</p>
        )}
      </div>

      {deleteError && <p className="mb-2 text-xs text-danger-500">{deleteError}</p>}

      {query.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
      {query.isError && <p className="text-sm text-danger-500">Failed to load system images.</p>}
      {query.data && images.length === 0 && (
        <p className="text-sm text-slate-500">No system images found.</p>
      )}
      {images.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-800 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Default boot</th>
                <th className="px-3 py-2">Running</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {images.map((image) => (
                <tr key={image.name} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-mono text-xs text-white">{image.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {image.isDefaultBoot ? <span className="text-success-500">Yes</span> : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {image.isRunning ? <span className="text-success-500">Yes</span> : '—'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!image.isDefaultBoot &&
                      (queuedDefaultBootNames.has(image.name) ? (
                        <span className="mr-3 text-xs text-slate-500">Queued</span>
                      ) : (
                        <button
                          onClick={() => queueSetDefaultBoot(image.name)}
                          className="mr-3 text-xs text-accent-500 hover:text-accent-400"
                        >
                          Set as default boot
                        </button>
                      ))}
                    {!image.isRunning && (
                      <button
                        onClick={() => void handleDelete(image.name)}
                        disabled={deletingName === image.name}
                        className={
                          confirmingDeleteName === image.name
                            ? 'text-xs text-danger-500 hover:text-danger-400'
                            : 'text-xs text-slate-500 hover:text-danger-500'
                        }
                      >
                        {deletingName === image.name
                          ? 'Deleting…'
                          : confirmingDeleteName === image.name
                            ? 'Confirm delete?'
                            : 'Delete'}
                      </button>
                    )}
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
