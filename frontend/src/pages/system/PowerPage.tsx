import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Modal from '../../components/Modal'
import { useSystemInfo } from '../../hooks/useSystemInfo'
import { buttonClass, inputClass, labelClass } from '../../lib/formStyles'
import { poweroffSystem, rebootSystem } from '../../lib/vyosApi'

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
      <RebootSection />
      <PoweroffSection hostname={info?.hostname ?? ''} />
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
