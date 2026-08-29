import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Optional footer row (typically action buttons), rendered below
   * `children` in its own bordered-off row. Most callers with actions
   * (submit/cancel, confirm/cancel) will want this rather than mixing
   * buttons into `children`; simple informational modals can omit it. */
  footer?: React.ReactNode
}

/**
 * A generic overlay dialog - the first modal/dialog component in this
 * app (every other confirm/edit flow elsewhere uses an inline
 * expand-in-place panel instead, e.g. ImagesPage.tsx's two-click
 * "Delete -> Confirm delete?" or ContainerForm.tsx's inline create/
 * edit form). Introduced for flows that genuinely need to interrupt
 * the page rather than expand within it - e.g. DHCP's "Make static"
 * (MakeStaticModal.tsx, pre-filling an editable form from a lease)
 * and the Power page's poweroff confirmation (typing the router's
 * hostname) - see those callers for concrete usage.
 *
 * Rendered via a portal directly into document.body so it always sits
 * above the rest of the page regardless of any ancestor's overflow/
 * z-index/transform, including PendingChangesBar's own `fixed z-50`
 * footer - this modal uses z-[60] specifically to stay above that.
 *
 * Closes on Escape or a click on the backdrop; callers are
 * responsible for their own submit-then-close logic (this component
 * has no concept of "submitting", only "closing").
 */
export default function Modal({ title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-lg rounded-xl border border-surface-border bg-surface-900 p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id="modal-title" className="text-sm font-medium text-white">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-300"
          >
            Close
          </button>
        </div>
        {children}
        {footer && <div className="mt-4 flex items-center gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
