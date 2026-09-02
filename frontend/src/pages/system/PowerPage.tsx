import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Modal from '../../components/Modal'
import { useSystemInfo } from '../../hooks/useSystemInfo'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { confirmCommit, poweroffSystem, rebootSystem, rollback, save } from '../../lib/vyosApi'
import { useUnsavedCommitStore } from '../../store/unsavedCommit'

// Fixed commit-confirm window Rollback always requests - no
// configurable control here (unlike PendingChangesBar.tsx's "Safe
// apply" seconds input, which is specifically about a normal Commit),
// matching PendingChangesBar's own Rollback button, which always
// protects itself the same way with no opt-out. See
// store/unsavedCommit.ts's doc comment for why rolling back to the
// saved configuration isn't automatically risk-free.
const ROLLBACK_CONFIRM_SECONDS = 90

/**
 * Immediate reboot/poweroff (`reboot now` / `poweroff now` - see
 * lib/vyosApi.ts's rebootSystem/poweroffSystem and the backend's
 * power_handlers.go). Deliberately two very differently-weighted
 * confirmation flows for the two actions:
 *
 * - Reboot uses the same two-click "Reboot -> Confirm reboot?"
 *   pattern as every other destructive action in this app (e.g.
 *   ImagesPage.tsx's image delete) - a reboot is disruptive but
 *   self-recovering.
 * - Poweroff requires typing the router's own hostname into a modal
 *   dialog (the first user of Modal.tsx) before it's enabled - a
 *   stronger deliberate-input confirmation, since a remote poweroff
 *   may be unrecoverable without physical/IPMI/PDU access to the
 *   router (nothing in this app can turn it back on).
 *
 * Neither action is staged through the pending-changes cart - these
 * are immediate op-mode commands, not configuration, matching how
 * VyOS's own CLI treats them.
 */
export default function PowerPage() {
  const { data: info } = useSystemInfo()

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Before a reboot or poweroff, consider{' '}
        <NavLink to="/config-tree" className="text-accent-500 hover:text-accent-400">
          exporting a copy of the current configuration
        </NavLink>{' '}
        from the Config Tree page - a quick safety net if you need to compare or restore it later.
      </p>
      <SaveSection />
      <RollbackSection />
      <RebootSection />
      <PoweroffSection hostname={info?.hostname ?? ''} />
    </div>
  )
}

/**
 * Always-available manual Save, independent of the pending-changes
 * cart or PendingChangesBar.tsx's own "committed but not saved"
 * indicator - see store/unsavedCommit.ts's doc comment for why that
 * indicator can only ever track commits made through this app itself.
 * A commit made via the CLI, another session, or another browser is
 * invisible to it, so this button exists as the way to still save
 * proactively regardless of what this app does or doesn't know about.
 */
function SaveSection() {
  const markSaved = useUnsavedCommitStore((s) => s.markSaved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSave() {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await save()
      markSaved()
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        Save configuration
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Persists the currently running configuration to disk, independent of the pending-changes
        cart - useful after changes made via the CLI, another session, or a previous visit this
        app didn't track.
      </p>
      <button onClick={() => void handleSave()} disabled={busy} className={`bg-surface-800 ${buttonClass}`}>
        {busy ? 'Saving…' : 'Save now'}
      </button>
      {done && !error && <p className="mt-2 text-xs text-success-500">Configuration saved.</p>}
      {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}
    </div>
  )
}

/**
 * Always-available rollback, independent of PendingChangesBar.tsx's
 * own "committed but not saved" indicator - since that indicator can
 * only ever track commits made through this app (see
 * store/unsavedCommit.ts's doc comment), this exists so an operator
 * can still discard divergence from the saved configuration that this
 * app never noticed (e.g. committed via the CLI).
 *
 * Two-step confirmation, unlike SaveSection: Rollback discards
 * whatever's currently running in favor of the last saved
 * configuration, and this component has no visibility into what
 * exactly that discards (unlike PendingChangesBar.tsx's own Rollback
 * button, which the operator can expand to review first) - so an
 * explicit "Confirm rollback?" click is required before even sending
 * the request, on top of the VyOS-side commit-confirm window every
 * rollback also gets (ROLLBACK_CONFIRM_SECONDS) - if the saved
 * configuration itself turns out to be broken, not confirming within
 * that window lets VyOS automatically restore what was running before
 * the rollback.
 */
function RollbackSection() {
  const markSaved = useUnsavedCommitStore((s) => s.markSaved)
  const [confirming, setConfirming] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleRollback() {
    if (!confirming) {
      setConfirming(true)
      setError(null)
      return
    }
    setConfirming(false)
    setBusy(true)
    setError(null)
    try {
      const result = await rollback(ROLLBACK_CONFIRM_SECONDS)
      if (result.pendingConfirm) {
        setPendingConfirm(true)
      } else {
        markSaved()
        setDone(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to roll back configuration.')
    } finally {
      setBusy(false)
    }
  }

  async function handleKeep() {
    setBusy(true)
    setError(null)
    try {
      // Same underlying VyOS mechanism as PendingChangesBar.tsx's own
      // commit-confirm - confirms the one session-scoped timer
      // regardless of which endpoint started it.
      await confirmCommit()
      markSaved()
      setPendingConfirm(false)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm the rollback.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-danger-500/40 bg-surface-900 p-4">
      <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-danger-500">Rollback</h2>
      <p className="mb-3 text-xs text-slate-500">
        Discards any committed-but-unsaved configuration, restoring the last saved configuration
        - independent of the pending-changes cart, and independent of whether this app itself
        tracked the commit (e.g. one made via the CLI). Always protected by a{' '}
        {ROLLBACK_CONFIRM_SECONDS}-second commit-confirm window: VyOS automatically restores what
        was running if you don&apos;t confirm in time.
      </p>
      {done ? (
        <p className="text-xs text-success-500">Rolled back to the last saved configuration.</p>
      ) : pendingConfirm ? (
        <div>
          <p className="mb-2 text-xs text-warning-500">
            Keep this rollback? VyOS will automatically restore what was running otherwise.
          </p>
          <button
            onClick={() => void handleKeep()}
            disabled={busy}
            className="rounded-lg bg-success-500 px-3 py-1.5 text-xs font-medium text-black hover:brightness-110 disabled:opacity-60"
          >
            {busy ? 'Confirming…' : 'Keep this rollback'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => void handleRollback()}
          disabled={busy}
          className={confirming ? `bg-danger-600 ${buttonClass}` : `bg-surface-800 ${buttonClass}`}
        >
          {busy ? 'Rolling back…' : confirming ? 'Confirm rollback?' : 'Rollback'}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}
    </div>
  )
}

function RebootSection() {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleReboot() {
    if (!confirming) {
      setConfirming(true)
      setError(null)
      return
    }
    setConfirming(false)
    setBusy(true)
    setError(null)
    try {
      await rebootSystem()
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reboot.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-900 p-4">
      <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Reboot</h2>
      <p className="mb-3 text-xs text-slate-500">
        Restarts the router immediately. Only committed and saved configuration survives a reboot
        - anything still sitting in the pending-changes cart is lost.
      </p>
      {done ? (
        <p className="text-xs text-success-500">
          Reboot command sent - the router is restarting now. This session will disconnect
          shortly.
        </p>
      ) : (
        <button
          onClick={() => void handleReboot()}
          disabled={busy}
          className={confirming ? `bg-danger-600 ${buttonClass}` : `bg-surface-800 ${buttonClass}`}
        >
          {busy ? 'Rebooting…' : confirming ? 'Confirm reboot?' : 'Reboot'}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}
    </div>
  )
}

function PoweroffSection({ hostname }: { hostname: string }) {
  const [showModal, setShowModal] = useState(false)
  const [typedHostname, setTypedHostname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const canConfirm = hostname !== '' && typedHostname === hostname

  function openModal() {
    setShowModal(true)
    setTypedHostname('')
    setError(null)
  }

  async function handlePoweroff() {
    if (!canConfirm || busy) return
    setBusy(true)
    setError(null)
    try {
      await poweroffSystem()
      setDone(true)
      setShowModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to power off.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-danger-500/40 bg-surface-900 p-4">
      <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-danger-500">Power off</h2>
      <p className="mb-3 text-xs text-slate-500">
        Shuts the router down immediately. Unlike a reboot, bringing it back online afterwards
        needs physical access, IPMI, or a remote-controlled PDU - nothing in this app can power it
        back on.
      </p>
      {done ? (
        <p className="text-xs text-success-500">
          Poweroff command sent - the router is shutting down now. This session will disconnect
          shortly.
        </p>
      ) : (
        <button onClick={openModal} className={`bg-danger-600 ${buttonClass}`}>
          Power off…
        </button>
      )}

      {showModal && (
        <Modal
          title="Confirm power off"
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button
                onClick={() => void handlePoweroff()}
                disabled={!canConfirm || busy}
                className={`bg-danger-600 ${buttonClass}`}
              >
                {busy ? 'Powering off…' : 'Power off now'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </>
          }
        >
          <p className="mb-3 text-xs text-slate-400">
            This shuts the router down immediately - there is no way to remotely power it back on
            through this app. To confirm, type the router&apos;s hostname (
            <span className="font-mono text-white">{hostname || '…'}</span>) below.
          </p>
          <label className={labelClass}>
            Hostname
            <input
              autoFocus
              value={typedHostname}
              onChange={(e) => setTypedHostname(e.target.value)}
              className={inputClass}
            />
          </label>
          {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}
        </Modal>
      )}
    </div>
  )
}
